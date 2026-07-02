/* =========================================================
   ai_plan.js — AI PLAN 2분할 (기능 3·4·5)
   - 'GEMINI AI 분석 실행' 클릭 시마다 실시간 Gemini 2.5 Pro 호출 (기능4)
   - 결과를 '추천 기획전'(효율형) + '참신한 기획전'(고연관·미사용 조합)로 2분할 (기능3)
   - 속성 명시 + 속성 간 연결구조 중심 출력, 서술 최소화 (기능5)
   - 로컬 연관규칙(support/lift) 분석으로 Gemini를 실제 데이터에 grounding
   ========================================================= */
window.AIPlan = {
  AX: ["placement", "theme", "benefit", "product", "brand", "card", "metric"],

  /* =========================================================
     시즌 정합성 엔진 (학술 근거)
     - 계절성 연관규칙: 글로벌 support는 시즌을 무시하므로 시즌 윈도우로 분석해야 함
       (Seasonal/Temporal Association Rule Mining)
     - 온톨로지 의미거리: 공통조상(LCA)이 깊고 가까울수록 유사 → 시즌/카테고리 가지를 공유해야 거리가 가깝다
       (edge-counting / path distance)
     - 스키마 적합성 이론: 추천=적합(congruent), 참신='중간' 부조화(moderate incongruity).
       여름 시즌오프 → 가을 신상 같은 '극단 부조화/시즌 점프'는 금지.
     ========================================================= */
  SEASON_KW: {
    "봄": ["봄", "스프링", "spring", "S/S", "SS시즌"],
    "여름": ["여름", "썸머", "summer", "바캉스", "휴가", "장마", "우기", "쿨", "린넨", "비치", "워터", "수영", "썬", "자외선", "🏖", "☀"],
    "가을": ["가을", "어텀", "autumn", "fall", "F/W 신상", "기모 시작"],
    "겨울": ["겨울", "윈터", "winter", "패딩", "코트", "방한", "기모", "다운", "연말", "크리스마스", "한파", "방학"],
    "간절기": ["간절기", "환절기", "트렌치", "가디건", "자켓 시즌"],
  },
  OFFSEASON_KW: ["시즌오프", "시즌 오프", "season sale", "시즌세일", "시즌 세일", "마지막", "클리어런스", "clearance", "이월", "재고", "땡처리", "outlet", "아울렛", "리미티드", "소진", "균일가", "현대백화점 아울렛"],
  SEASON_ADJ: { "봄": ["겨울", "여름", "간절기"], "여름": ["봄", "가을", "간절기"], "가을": ["여름", "겨울", "간절기"], "겨울": ["가을", "봄", "간절기"], "간절기": ["봄", "여름", "가을", "겨울"] },

  _calendarSeason(d) {
    const m = (d || new Date()).getMonth() + 1;
    if (m >= 3 && m <= 5) return "봄";
    if (m >= 6 && m <= 8) return "여름";
    if (m >= 9 && m <= 11) return "가을";
    return "겨울";
  },

  /* 텍스트에서 시즌 태그 추출 */
  _seasonsOf(text) {
    const t = String(text || "");
    const found = [];
    for (const s in this.SEASON_KW) if (this.SEASON_KW[s].some(k => t.includes(k))) found.push(s);
    return found;
  },
  _isOffseason(text) { const t = String(text || "").toLowerCase(); return this.OFFSEASON_KW.some(k => t.toLowerCase().includes(k.toLowerCase())); },

  _eventText(e) {
    return [e.name || "", (e.tabs || []).join(" "), ((e.kw && e.kw.theme) || []).join(" "), ((e.kw && e.kw.benefit) || []).join(" ")].join(" ");
  },

  /* 조회 집합의 시즌 프로파일 — 앵커 0순위 + 허용/금지 시즌(온톨로지 거리 가드) */
  _seasonProfile(evs) {
    const cnt = {}, N = Math.max(1, evs.length); let off = 0;
    evs.forEach(e => {
      const txt = this._eventText(e);
      this._seasonsOf(txt).forEach(s => cnt[s] = (cnt[s] || 0) + 1);
      if (this._isOffseason(txt)) off++;
    });
    const ranked = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
    const source = ranked.filter(([, n]) => n / N >= 0.15).map(([s]) => s);
    const calendar = this._calendarSeason(new Date());
    const isOff = off / N >= 0.3;
    // 허용 시즌: 원천 시즌(+달력 시즌) + 간절기/상시. 시즌오프면 원천 시즌만(+간절기) — 다른 시즌 '신상/스타일제안' 금지
    const base = new Set(source.length ? source : [calendar]);
    const allowed = new Set([...base, "간절기", "상시"]);
    if (!isOff) base.forEach(s => (this.SEASON_ADJ[s] || []).forEach(a => allowed.add(a)));  // 정시즌은 인접 시즌까지 허용
    const all = ["봄", "여름", "가을", "겨울"];
    const forbidden = all.filter(s => !allowed.has(s));
    return {
      source_seasons: [...base], dominant: ranked[0] ? ranked[0][0] : (source[0] || calendar),
      calendar_season: calendar, is_offseason: isOff, offseason_ratio: +(off / N).toFixed(2),
      intent: isOff ? "clearance(시즌오프·재고소진)" : "regular(정시즌)",
      allowed_seasons: [...allowed], forbidden_seasons: forbidden,
      rule: isOff
        ? "원천이 시즌오프(재고소진)이므로 추천·참신 모두 원천 시즌(" + [...base].join("/") + ")의 클리어런스/추가특가/간절기 전환에 머물 것. 다른 시즌의 신상·스타일 제안으로 점프 금지."
        : "추천은 원천 시즌 적합(congruent), 참신은 동일 시즌 스키마 내 중간 부조화(새 조합)만 허용. 정반대 시즌(" + forbidden.join("/") + ")으로의 점프 금지.",
    };
  },

  /* 산출물의 시즌 이탈 검사 (온톨로지 거리 가드) — 위반 시 재생성 트리거 */
  _seasonDrift(proposal, profile) {
    if (!proposal || !profile || !profile.forbidden_seasons.length) return null;
    const txt = [proposal.title || "", ((proposal.attributes || []).map(a => a.value)).join(" "), proposal.structure || "", proposal.guide || ""].join(" ");
    const seasons = this._seasonsOf(txt);
    const bad = seasons.filter(s => profile.forbidden_seasons.includes(s));
    return bad.length ? bad : null;
  },

  visible() {
    try { return (typeof getCurrentVisibleEvents === "function") ? getCurrentVisibleEvents() : (window.EVENTS || []); }
    catch (e) { return window.EVENTS || []; }
  },

  /* 속성 통계 (조회집합 내 support·성과) */
  _attrStats(evs) {
    const stat = {}; const N = Math.max(1, evs.length);
    evs.forEach(e => {
      const seen = new Set();
      this.AX.forEach(axis => (e.kw[axis] || []).forEach(v => {
        const k = axis + "|" + v; if (seen.has(k)) return; seen.add(k);
        const s = stat[k] || (stat[k] = { axis, value: v, n: 0, sales: 0, conv: 0 });
        s.n++; s.sales += (e.sales || 0); s.conv += (e.convRate || 0);
      }));
    });
    return Object.values(stat).map(s => ({
      axis: s.axis, value: s.value, support: s.n / N,
      avgSales: Math.round(s.sales / s.n), avgConv: +(s.conv / s.n).toFixed(2), n: s.n,
    }));
  },

  /* 전역 co-occurrence 기반 '관련도 높지만 미사용' 조합 탐색 (참신) */
  _novelPairs(allEvents, topAttrs) {
    // 상위 빈도 속성 간 동시출현 행렬
    const keys = topAttrs.slice(0, 36).map(a => a.axis + "|" + a.value);
    const idx = {}; keys.forEach((k, i) => idx[k] = i);
    const co = keys.map(() => keys.map(() => 0));
    const cnt = keys.map(() => 0);
    allEvents.forEach(e => {
      const present = [];
      this.AX.forEach(axis => (e.kw[axis] || []).forEach(v => { const k = axis + "|" + v; if (k in idx) present.push(idx[k]); }));
      const uniq = [...new Set(present)];
      uniq.forEach(i => cnt[i]++);
      for (let a = 0; a < uniq.length; a++) for (let b = a + 1; b < uniq.length; b++) { co[uniq[a]][uniq[b]]++; co[uniq[b]][uniq[a]]++; }
    });
    // 관련도 = 동시출현 벡터 코사인 (공통 이웃 많음) / 직접 동시출현은 0에 가까움
    const cosRow = (i, j) => {
      let dot = 0, na = 0, nb = 0;
      for (let t = 0; t < keys.length; t++) { dot += co[i][t] * co[j][t]; na += co[i][t] ** 2; nb += co[j][t] ** 2; }
      return (na && nb) ? dot / Math.sqrt(na * nb) : 0;
    };
    const out = [];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const ai = keys[i].split("|"), aj = keys[j].split("|");
        if (ai[0] === aj[0]) continue;               // 같은 축 조합 제외
        if (co[i][j] >= 2) continue;                  // 이미 함께 쓰임 → 제외
        const rel = cosRow(i, j);
        if (rel >= 0.3 && cnt[i] >= 3 && cnt[j] >= 3) {
          out.push({ a: { axis: ai[0], value: ai[1] }, b: { axis: aj[0], value: aj[1] }, relatedness: +rel.toFixed(3), coUse: co[i][j] });
        }
      }
    }
    return out.sort((x, y) => y.relatedness - x.relatedness).slice(0, 8);
  },

  /* ★앵커 신호: 1순위 브랜드 → 2순위 카테고리 → 3순위 제목패턴 (온톨로지 근접성 보장) */
  _anchor(evs) {
    const bs = {}, cs = {}, tw = {};
    const stop = new Set(["기획전", "이벤트", "OUTLET", "아울렛", "LFmall", "LF", "단독", "기간", "최대", "혜택", "시작", "특가", "세일", "SALE", "BEST"]);
    evs.forEach(e => {
      (e.brands || []).forEach(b => { const s = bs[b] || (bs[b] = { brand: b, plans: 0, sales: 0 }); s.plans++; s.sales += (e.sales || 0); });
      const cats = new Set();
      if (e.main_category) cats.add(e.main_category);
      // 상품축 중 '카테고리'만 채택 — 수량/구조 디스크립터(대량/멀티브랜드/소량/숫자/괄호)는 제외
      ((e.kw && e.kw.product) || []).forEach(p => { if (!/대량|소량|중량|멀티브랜드|단일브랜드|브랜드$|[()\d]/.test(p)) cats.add(p); });
      cats.forEach(c => { const s = cs[c] || (cs[c] = { cat: c, plans: 0, sales: 0 }); s.plans++; s.sales += (e.sales || 0); });
      String(e.name || "").replace(/[\[\]\(\)\/_·\-:,!?#&]/g, " ").split(/\s+/).forEach(t => {
        t = t.trim(); if (t.length < 2 || stop.has(t) || /^\d+$/.test(t)) return; tw[t] = (tw[t] || 0) + 1;
      });
    });
    return {
      rank1_brands: Object.values(bs).sort((a, b) => b.plans - a.plans || b.sales - a.sales).slice(0, 8)
        .map(s => ({ brand: s.brand, plans: s.plans, avgSales_manwon: Math.round(s.sales / s.plans) })),
      rank2_categories: Object.values(cs).sort((a, b) => b.plans - a.plans || b.sales - a.sales).slice(0, 8)
        .map(s => ({ category: s.cat, plans: s.plans, avgSales_manwon: Math.round(s.sales / s.plans) })),
      rank3_title_patterns: Object.entries(tw).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, n]) => ({ term: t, count: n })),
    };
  },

  /* 조회집합 약점 신호 (장점/단점/보완점 도출 근거; AI INSIGHT와 동일 결) */
  _weakSignals(evs) {
    const N = Math.max(1, evs.length);
    let noTheme = 0, noCoupon = 0, noPerf = 0, vis = 0, cx = 0, highCx = 0, bigProd = 0;
    evs.forEach(e => {
      if (!(e.kw && e.kw.theme && e.kw.theme.length)) noTheme++;
      if (e.coupon_type === "쿠폰없음" || !e.coupon_type) noCoupon++;
      if (!(e.sales > 0)) noPerf++;
      vis += (e.visibility_score || 0); cx += (e.complexity_score || 0);
      if ((e.complexity_score || 0) >= 80) highCx++;
      if ((e.prodCnt || 0) >= 300) bigProd++;
    });
    const r = x => +(x / N).toFixed(2);
    return {
      missing_theme_ratio: r(noTheme), no_coupon_ratio: r(noCoupon), no_perf_data_ratio: r(noPerf),
      avg_visibility: Math.round(vis / N), avg_complexity: Math.round(cx / N),
      high_complexity_ratio: r(highCx), large_catalog_ratio: r(bigProd),
    };
  },

  /* 통합 분석 신호 (프롬프트 grounding) */
  signals(evs) {
    const all = window.EVENTS || [];
    const season = this._seasonProfile(evs);
    // 시즌 윈도우: 금지 시즌을 가리키는 theme 속성값은 신호에서 제외 (계절성 연관규칙)
    const banSeason = v => { const ss = this._seasonsOf(v); return ss.some(s => season.forbidden_seasons.includes(s)); };
    const stats = this._attrStats(evs).sort((a, b) => b.avgSales - a.avgSales);
    const recoSignals = stats.filter(s => s.support >= 0.12 && !(s.axis === "theme" && banSeason(s.value))).slice(0, 12);
    const globalTop = this._attrStats(all).sort((a, b) => b.n - a.n);
    const novel = this._novelPairs(all, globalTop)
      .filter(p => !banSeason(p.a.value) && !banSeason(p.b.value));   // 시즌 점프 조합 배제
    return {
      scope_count: evs.length,
      season_profile: season,
      anchor_priority: this._anchor(evs),
      weak_signals: this._weakSignals(evs),
      high_perf_attributes: recoSignals.map(s => ({ attr: s.axis + ":" + s.value, support: +s.support.toFixed(2), avgSales_manwon: s.avgSales, n: s.n })),
      novel_candidate_pairs: novel.map(p => ({ pair: p.a.axis + ":" + p.a.value + " × " + p.b.axis + ":" + p.b.value, relatedness: p.relatedness, currently_combined: p.coUse })),
      top_plans: evs.slice().sort((a, b) => (b.sales || 0) - (a.sales || 0)).slice(0, 8).map(e => ({
        name: e.name, sales_manwon: e.sales || 0, disc: e.discMin + "~" + e.discMax + "%",
        brands: (e.brands || []).slice(0, 3), category: e.main_category || "",
        visibility: e.visibility_score || 0, complexity: e.complexity_score || 0,
        attrs: this.AX.flatMap(a => (e.kw[a] || []).slice(0, 2)),
      })),
    };
  },

  buildPrompt(evs) {
    const ctx = this.signals(evs);
    return (
"당신은 LFmall 기획전 전략가입니다. 아래는 실제 운영 DB에서 추출한 온톨로지 분석 신호입니다.\n" +
JSON.stringify(ctx, null, 1) + "\n\n" +
"두 가지 기획전 방향을 제안하세요. 반드시 순수 JSON만 출력합니다(코드펜스 금지).\n" +
"- recommended(추천 기획전): high_perf_attributes를 조합해 '효율이 검증된' 기획전. 실제 성과가 높은 속성 중심.\n" +
"- novel(참신한 기획전): novel_candidate_pairs처럼 '연관도는 높으나 함께 쓰인 적 없는' 속성 조합으로 새로운 기획전.\n" +
"서술은 최소화하고 속성과 연결구조 위주로. 스키마:\n" +
'{\n' +
'  "recommended": {"title": "한글 기획전명", "attributes": [{"axis":"placement|theme|benefit|product|brand|metric","value":"속성값"}], "structure": "속성A × 속성B → 기획전형태(한 줄)", "score": 0~100 정수(성과 스코어: 전환율 1순위, 매출/support 보조), "evidence": ["근거1","근거2","근거3"], "why": "근거 1문장(데이터 기반)", "benchmark": "top_plans 중 참고 기획전명(정확히 일치)", "kpi_target": "기대 KPI 1개"},\n' +
'  "novel": {"title": "한글 기획전명", "attributes": [{"axis":"placement|theme|benefit|product|brand|metric","value":"속성값"}], "structure": "속성A × 속성B → 기획전형태(한 줄)", "score": 0~100 정수(참신도 스코어: (1-사용빈도)×연관강도), "evidence": ["근거1","근거2","근거3"], "why_related": "두 속성이 연관 높은 이유 1문장", "gap": "기존에 안 쓰인 이유/기회 1문장", "risk": "주의점 1개"}\n' +
'}\n' +
"attributes는 각 3~5개. value는 신호에 등장한 실제 속성을 우선 사용. score는 신호의 support/avgConv/relatedness 수치에 근거해 산정. evidence는 점수의 핵심 근거 3개(지표/속성/관계)."
    );
  },

  card(kind, d, accent) {
    if (!d) return "";
    const chips = (d.attributes || []).map(a =>
      '<span class="enumChip on" style="border-color:' + accent + '">' + this._esc((a.axis ? a.axis + "·" : "") + a.value) + '</span>').join("");
    const rows = [];
    if (d.structure) rows.push(["🔗 연결구조", d.structure]);
    if (d.why) rows.push(["📊 근거", d.why]);
    if (d.why_related) rows.push(["🧲 연관성", d.why_related]);
    if (d.gap) rows.push(["💡 기회", d.gap]);
    if (d.benchmark) rows.push(["🎯 벤치마크", d.benchmark]);
    if (d.kpi_target) rows.push(["📈 KPI", d.kpi_target]);
    if (d.risk) rows.push(["⚠️ 주의", d.risk]);
    return (
      '<div class="planCard" style="border-left:3px solid ' + accent + '">' +
        '<div class="pt" style="color:' + accent + '">' + kind + ' · ' + this._esc(d.title || "") + '</div>' +
        '<div class="enumVals" style="margin:6px 0 8px">' + chips + '</div>' +
        rows.map(r => '<div style="font-size:11.5px;line-height:1.55;margin:2px 0"><b style="color:var(--ink)">' + r[0] + '</b> ' + this._esc(r[1]) + '</div>').join("") +
      '</div>'
    );
  },

  async run() {
    const box = document.getElementById("recoBox");
    const empty = document.getElementById("recoEmpty");
    const btn = document.getElementById("runAiBtn");
    const evs = this.visible();
    if (!evs || evs.length === 0) { if (typeof toast === "function") toast("분석할 기획전이 없습니다."); return; }

    GeminiClient.ensureSpinKeyframe();
    if (empty) empty.style.display = "none";
    box.className = "recoBox show";
    const modelName = GeminiClient.model();
    box.innerHTML = '<div class="rh">💡 AI PLAN <span class="ai">' + modelName + ' 분석…</span></div>' + GeminiClient.spinner("조회 " + evs.length + "개 · 온톨로지 연관규칙 분석 중…");
    if (btn) { btn.disabled = true; btn.style.opacity = ".6"; }

    try {
      const data = await GeminiClient.generateJSON(this.buildPrompt(evs));
      const html =
        '<div class="rh">💡 AI PLAN <span class="ai">' + modelName + ' · 실시간</span></div>' +
        '<div class="rsum">조회 <b>' + evs.length + '개</b> 기획전의 온톨로지(속성 support·lift) 분석 기반 2-방향 제안</div>' +
        '<div class="planGrid">' +
          this.card("✅ 추천 기획전", data.recommended, "#22c55e") +
          this.card("✨ 참신한 기획전", data.novel, "#f59e0b") +
        '</div>';
      box.innerHTML = html;
      // 기존 프로토타입 프리뷰 호환
      if (window.AIEngine) {
        const r = data.recommended || {};
        window.AIEngine.lastAiReply = html + "\n<!-- PROTOTYPE_METADATA:\n" + JSON.stringify({
          title: r.title || "AI 추천 기획전", brand: (r.attributes || []).filter(a => a.axis === "brand").map(a => a.value)[0] || "LFmall",
          sub: r.structure || "", coupon: "", couponDesc: "", attention: [r.kpi_target || ""].filter(Boolean),
        }) + "\n-->";
        box.innerHTML += '<button class="btn" style="margin-top:12px;width:100%" onclick="openPrototypeModal()">✨ LFmall NEW 템플릿 프로토타입 프리뷰</button>';
      }
    } catch (err) {
      box.innerHTML = '<div class="rh">💡 AI PLAN <span class="ai" style="background:var(--bad)">에러</span></div>' +
        '<div style="font-size:12px;color:var(--bad);padding:12px;border:1px solid var(--bad);border-radius:8px;background:rgba(239,68,68,.08);margin-top:8px">' +
        this._esc(err.message) + '<br><br>① API 키/쿼터 ② 모델명 ③ CORS를 확인하세요.</div>';
    } finally {
      if (btn) { btn.disabled = false; btn.style.opacity = "1"; }
    }
  },

  _esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); },
};

/* 'GEMINI AI 분석 실행' 버튼을 Gemini 2.5 Pro 2분할 분석으로 연결 (기존 핸들러 대체) */
window.runGeminiAnalysis = function () { return AIPlan.run(); };
