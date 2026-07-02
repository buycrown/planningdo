/* =========================================================
   ai_plan_compose.js — AI PLAN '구성 속성 명시' 강화 (기능3 보강)
   - 'GEMINI AI 분석 실행' 결과(추천 기획전 / 참신한 기획전)에
     ① 서술형 설명(guide)은 유지하고
     ② "이렇게 구성하세요 — 구성 속성"으로 어떤 속성값으로 만들지 칩으로 명시한다.
   - 필터 변경 시 자동으로 뜨던 옛 장문 휴리스틱(renderReco)은 비활성화하여
     AI PLAN은 오직 Gemini 실행 결과로 일원화한다. (index.html 비침투)
   - ai_plan.js 이후 로드되어 AIPlan.buildPrompt / AIPlan.card 를 오버라이드한다.
   ========================================================= */
(function () {
  if (!window.AIPlan) { console.warn("[ai_plan_compose] AIPlan 미로딩"); return; }
  const AX_LABEL = { placement: "노출구좌", theme: "테마", benefit: "혜택", product: "상품구성", brand: "브랜드", metric: "성과", visual: "비주얼", price: "가격", target: "타깃" };

  // 0) 외부 지침서 + 4-에이전트 역할 MD 로드 — 추천/참신 생성 기준의 단일 출처
  AIPlan._guideline = null;
  AIPlan._agents = null;
  AIPlan._loadGuideline = async function () {
    if (this._guideline !== null) return;
    const get = async (p) => { try { const r = await fetch(p + "?_" + Date.now(), { cache: "no-store" }); return r.ok ? await r.text() : ""; } catch (e) { return ""; } };
    this._guideline = await get("agents/ai_plan_advisor.md");
    const files = [
      ["Event Data Analyst", "agents/Event Data Analyst.md"],
      ["Event Strategy Planner", "agents/Event Strategy Planner.md"],
      ["Event Creative Director", "agents/Event Creative Director.md"],
      ["Event Suggestion Evaluator", "agents/Event Suggestion Evaluator.md"],
    ];
    const loaded = await Promise.all(files.map(async ([name, p]) => ({ name, body: await get(p) })));
    this._agents = loaded.filter(a => a.body);
  };

  // 1) 프롬프트 구성: [지침서] + [4-에이전트 역할] + [분석 신호] + [4단 파이프라인·리치 스키마]
  AIPlan.buildPrompt = function (evs) {
    const ctx = this.signals(evs);
    const guide = this._guideline
      ? "다음 '지침서'를 반드시 준수하라.\n===== 지침서 시작 =====\n" + this._guideline + "\n===== 지침서 끝 =====\n\n"
      : "";
    // 토큰 절약: 4개 에이전트 MD 전문은 주입하지 않음(지침서 §0가 4-에이전트 절차를 이미 포함)
    return (
guide +
"## 실데이터 분석 신호(signals)\n" + JSON.stringify(ctx, null, 1) + "\n\n" +
"## 수행 절차 (4-에이전트 파이프라인, 내부적으로 단계 실행 후 종합)\n" +
"1) Data Analyst: 위 signals로 조회 집합의 장점/단점/보완점·성공요인을 도출한다(weak_signals를 반드시 활용).\n" +
"2) Strategy Planner: ★앵커 우선순위(1순위 brand=anchor_priority.rank1_brands → 2순위 category=rank2_categories → 3순위 title=rank3_title_patterns) 좌표 안에서, 단점→보완점을 실제로 반영하여 추천 1·참신 1을 설계한다. 앵커 이탈 금지.\n" +
"3) Creative Director: 각 제안에 메인카피 3·서브카피 3·비주얼 컨셉을 입힌다(진부어 금지).\n" +
"4) Suggestion Evaluator: 각 제안의 리스크를 검수하고 verdict·score를 확정한다.\n\n" +
"## ★시즌 정합성 / 온톨로지 거리 (필수 — 위반 시 무효)\n" +
"학술 근거: ①계절성 연관규칙(글로벌 빈도는 시즌을 무시 → 시즌 윈도우로 한정), ②온톨로지 의미거리(공통조상 LCA가 가까울수록 유사 → 같은 시즌·카테고리 가지를 공유해야 거리가 가깝다), ③스키마 적합성 이론(추천=시즌 적합, 참신=동일 시즌 스키마 내 '중간' 부조화만; 극단 부조화=시즌 점프는 거부됨).\n" +
"- 원천 시즌 = season_profile.source_seasons, 의도 = season_profile.intent, 허용 = season_profile.allowed_seasons, 금지 = season_profile.forbidden_seasons.\n" +
"- 추천·참신의 title·attributes(theme)·structure·guide·creative는 **허용 시즌 안에서만** 작성한다. **금지 시즌 단어(예: 가을/겨울 신상·스타일 제안)를 절대 쓰지 말 것.**\n" +
"- season_profile.is_offseason=true이면(시즌오프/재고소진) 추천·참신 모두 '원천 시즌의 클리어런스·추가특가·간절기 전환'에 머문다. 예: 여름 시즌오프 → '여름 막판 추가특가/바캉스 클리어런스/간절기 브리지'는 OK, '가을 스타일 제안'은 금지.\n" +
"- 참신도 시즌을 바꾸는 게 아니라, 같은 시즌·카테고리·앵커 브랜드 안에서 '아직 안 쓰인 속성 조합'으로 신규성을 만든다(중간 부조화).\n\n" +
"## 출력 — 순수 JSON만(코드펜스 금지). 스키마:\n" +
'{\n' +
'  "analysis": {\n' +
'    "anchor": {"brand": "1순위 브랜드 요약(실제 브랜드명 나열)", "category": "2순위 카테고리 요약", "title_pattern": "3순위 제목/테마 결 요약"},\n' +
'    "strengths": ["장점1","장점2","장점3"],\n' +
'    "weaknesses": ["단점1","단점2","단점3"],\n' +
'    "supplements": ["보완점1","보완점2"],\n' +
'    "season_fit": "원천 시즌/의도와 제안의 정합성 한 줄(허용 시즌 내에서 구성했음을 명시)",\n' +
'    "success_factors": "고성과 공통요인 1~2문장"\n' +
'  },\n' +
'  "recommended": {\n' +
'    "title": "한글 기획전명(앵커 브랜드/카테고리/제목결 반영)",\n' +
'    "attributes": [{"axis":"placement|theme|benefit|product|brand|card|metric","value":"속성값"}],\n' +
'    "brands": ["핵심 브랜드 2~4(앵커 rank1에서)"], "products": ["대표 상품군 2~4"],\n' +
'    "structure": "속성A × 속성B → 기획전형태(한 줄)",\n' +
'    "guide": "2~3문장 운영 가이드",\n' +
'    "applied_supplement": "이 기획전이 반영한 보완점 1문장",\n' +
'    "creative": {"main_copy": ["c1","c2","c3"], "sub_copy": ["s1","s2","s3"], "visual": "비주얼/UX 컨셉 1~2문장"},\n' +
'    "metrics": {"visibility": 0~100정수, "complexity": 0~100정수, "expected": "기대 성과 한 줄"},\n' +
'    "score": 0~100정수(성과 스코어: sales/support 기반),\n' +
'    "evidence": ["근거1","근거2","근거3"],\n' +
'    "why": "효율 근거 1문장(데이터 기반)", "benchmark": "top_plans 중 참고 기획전명(정확히 일치)", "kpi_target": "기대 KPI 1개",\n' +
'    "evaluation": {"verdict": "수정 후 승인|전면 재검토", "risk": "핵심 리스크 1~2개", "comment": "한 줄 총평"}\n' +
'  },\n' +
'  "novel": {\n' +
'    "title": "한글 기획전명(앵커 좌표 내 신규성)",\n' +
'    "attributes": [{"axis":"...","value":"..."}],\n' +
'    "brands": ["..."], "products": ["..."],\n' +
'    "structure": "속성A × 속성B → 기획전형태(한 줄)",\n' +
'    "guide": "2~3문장 운영 가이드",\n' +
'    "applied_supplement": "반영한 보완점 1문장",\n' +
'    "creative": {"main_copy": ["c1","c2","c3"], "sub_copy": ["s1","s2","s3"], "visual": "비주얼/UX 컨셉 1~2문장"},\n' +
'    "metrics": {"visibility": 0~100정수, "complexity": 0~100정수, "expected": "기대 성과 한 줄"},\n' +
'    "score": 0~100정수(참신도 스코어: (1-사용빈도)×연관강도),\n' +
'    "evidence": ["근거1","근거2","근거3"],\n' +
'    "why_related": "두 속성 연관 높은 이유 1문장", "gap": "기존 미사용 이유/기회 1문장", "risk": "주의점 1개",\n' +
'    "evaluation": {"verdict": "수정 후 승인|전면 재검토", "risk": "핵심 리스크 1~2개", "comment": "한 줄 총평"}\n' +
'  }\n' +
'}\n' +
"규칙: 7축만 사용. attributes 3~5개이며 각 value는 '단일 속성값'(콤마로 여러 값 나열 금지 — 예: brand는 한 칩에 한 브랜드). 여러 브랜드/카테고리는 brands·products 배열에 담아라. value는 signals에 등장한 실제 값 우선. 추천·참신 모두 앵커(브랜드>카테고리>제목)를 벗어나지 말 것. analysis.weaknesses는 supplements로, supplements는 각 제안의 applied_supplement·구성에 실제로 반영할 것."
    );
  };

  // 2) 카드 렌더 강화: 구성 속성(칩) + 서술형 guide + 분석근거
  AIPlan.card = function (kind, d, accent) {
    if (!d) return "";
    const chips = (d.attributes || []).map(a => {
      const axl = AX_LABEL[a.axis] || a.axis || "";
      return '<span class="enumChip on" style="border-color:' + accent + '">' +
        (axl ? '<b style="opacity:.65;font-weight:700;margin-right:3px">' + axl + '</b>' : '') +
        this._esc(a.value) + '</span>';
    }).join("");
    const isRec = /추천/.test(kind);
    // 점수 배지 (성과/참신도 0~100) — manyfast plan §3 차용
    const scoreLabel = isRec ? "성과" : "참신도";
    const scoreBadge = (d.score || d.score === 0)
      ? '<span style="background:' + accent + ';color:#0b1020;font-weight:800;font-size:11px;padding:2px 9px;border-radius:11px;margin-left:auto">' + scoreLabel + ' ' + this._esc(d.score) + '</span>'
      : '';
    // 근거 Top 3
    const evi = (Array.isArray(d.evidence) && d.evidence.length)
      ? '<div style="margin:4px 0 6px"><b style="color:var(--ink);font-size:11.5px">📌 근거 Top ' + Math.min(3, d.evidence.length) + '</b>' +
        '<ul style="margin:3px 0 0;padding-left:16px;font-size:11px;line-height:1.55">' +
        d.evidence.slice(0, 3).map(x => '<li>' + this._esc(x) + '</li>').join("") + '</ul></div>'
      : '';
    // 유사 사례 링크 (벤치마크 기획전명 → 실제 페이지)
    let benchHtml = "";
    if (d.benchmark) {
      const nm = String(d.benchmark);
      const ev = (window.EVENTS || []).find(e => e.name === nm) || (window.EVENTS || []).find(e => e.name && nm && e.name.indexOf(nm) >= 0);
      benchHtml = '<div style="font-size:11.5px;line-height:1.55;margin:2px 0"><b style="color:var(--ink)">🎯 유사 사례</b> ' +
        (ev ? '<a href="' + ev.url + '" target="_blank" rel="noopener" style="color:' + accent + ';text-decoration:underline">' + this._esc(nm) + ' ↗</a>' : this._esc(nm)) + '</div>';
    }
    const rows = [];
    if (d.structure) rows.push(["🔗 연결구조", d.structure]);
    if (d.why) rows.push(["📊 효율 근거", d.why]);
    if (d.why_related) rows.push(["🧲 연관성", d.why_related]);
    if (d.gap) rows.push(["💡 미사용 기회", d.gap]);
    if (d.kpi_target) rows.push(["📈 KPI", d.kpi_target]);
    if (d.risk) rows.push(["⚠️ 주의", d.risk]);
    return (
      '<div class="planCard" style="border-left:3px solid ' + accent + '">' +
        '<div class="pt" style="color:' + accent + ';display:flex;align-items:center;gap:6px">' + kind + ' · ' + this._esc(d.title || "") + scoreBadge + '</div>' +
        '<div style="font-size:10.5px;font-weight:800;color:var(--sub);margin:8px 0 4px">🧩 이렇게 구성하세요 — 구성 속성</div>' +
        '<div class="enumVals" style="margin-bottom:8px">' + (chips || '<span style="font-size:11px;color:var(--muted)">속성 없음</span>') + '</div>' +
        (d.guide ? '<div style="font-size:11.5px;line-height:1.65;background:rgba(255,255,255,.045);border:1px solid var(--line2);border-radius:8px;padding:9px 10px;margin-bottom:8px">📝 ' + this._esc(d.guide) + '</div>' : '') +
        evi +
        rows.map(r => '<div style="font-size:11.5px;line-height:1.55;margin:2px 0"><b style="color:var(--ink)">' + r[0] + '</b> ' + this._esc(r[1]) + '</div>').join("") +
        benchHtml +
      '</div>'
    );
  };

  // 결과 보존: 재실행 전까지 유지(모달 닫기·새로고침에도) — 불필요한 재호출 방지
  AIPlan._KEY = "lfmall_aiplan_v1";
  AIPlan._save = function () {
    try { if (this._last) localStorage.setItem(this._KEY, JSON.stringify(this._last)); } catch (e) {}
  };
  AIPlan._restore = function () {
    if (this._last) return true;
    try { var s = localStorage.getItem(this._KEY); if (s) { this._last = JSON.parse(s); return true; } } catch (e) {}
    return false;
  };

  // 2-b) 실행: 4-에이전트 파이프라인 호출 → recoBox 요약 + 상세 팝업(AIPlanModal)
  AIPlan.run = async function () {
    if (this._busy) return;   // 진행 중 중복 호출 방지(불필요한 호출 차단)
    const box = document.getElementById("recoBox");
    const empty = document.getElementById("recoEmpty");
    const btn = document.getElementById("runAiBtn");
    const evs = this.visible();
    if (!evs || evs.length === 0) { if (typeof toast === "function") toast("분석할 기획전이 없습니다."); return; }
    this._busy = true;

    GeminiClient.ensureSpinKeyframe();
    if (empty) empty.style.display = "none";
    box.className = "recoBox show";
    const model = GeminiClient.model();
    box.innerHTML = '<div class="rh">💡 AI PLAN <span class="ai">' + model + ' 분석…</span></div>' +
      GeminiClient.spinner("조회 " + evs.length + "개 · 4-에이전트(분석→전략→크리에이티브→검수) 분석 중…");
    if (btn) { btn.disabled = true; btn.style.opacity = ".6"; }

    try {
      await this._loadGuideline();
      const prompt = this.buildPrompt(evs);
      // 토큰 절약: 출력 상한 축소(8192면 리치 스키마 충분), 단일 호출
      let data = await GeminiClient.generateJSON(prompt, { maxOutputTokens: 8192 });
      // 시즌 정합성: 자동 재호출(2회차) 제거 → 드리프트는 '표시'만(토큰 추가 소모 방지)
      const prof = this.signals(evs).season_profile;
      const drift = [].concat(this._seasonDrift(data.recommended, prof) || [], this._seasonDrift(data.novel, prof) || []);
      this._last = { data: data, model: model, n: evs.length, tab: "rec", season: prof, drift_flag: drift.length > 0, ts: Date.now() };
      this._save();                                                  // 결과 보존(재실행 전까지 유지)
      if (window.PrototypeBuilder) window.PrototypeBuilder._clearProto();  // 새 제안 → 기존 프로토타입 무효화
      this._renderSummary();
      if (window.AIPlanModal) window.AIPlanModal.open(this._last);   // 결과 즉시 상세 팝업
      if (window.AIEngine) {
        const r = data.recommended || {};
        window.AIEngine.lastAiReply = "<!-- PROTOTYPE_METADATA:\n" + JSON.stringify({
          title: r.title || "AI 추천 기획전",
          brand: (r.brands || [])[0] || (r.attributes || []).filter(a => a.axis === "brand").map(a => a.value)[0] || "LFmall",
          sub: r.structure || "", coupon: "", couponDesc: "", attention: [r.kpi_target || ""].filter(Boolean),
        }) + "\n-->";
      }
    } catch (err) {
      box.innerHTML = '<div class="rh">💡 AI PLAN <span class="ai" style="background:var(--bad)">에러</span></div>' +
        '<div style="font-size:12px;color:var(--bad);padding:12px;border:1px solid var(--bad);border-radius:8px;background:rgba(239,68,68,.08);margin-top:8px">' +
        this._esc(err.message) + '<br><br>① API 키/쿼터 ② 모델명 ③ CORS를 확인하세요.</div>';
    } finally {
      this._busy = false;
      if (btn) { btn.disabled = false; btn.style.opacity = "1"; }
    }
  };

  // 요약 카드(recoBox): 앵커 + 추천/참신 제목·점수 + 상세보기 버튼
  AIPlan._renderSummary = function () {
    const box = document.getElementById("recoBox");
    if (!this._last) return;
    const d = this._last.data, a = d.analysis || {};
    const rec = d.recommended || {}, nov = d.novel || {};
    const sp = this._last.season;
    const seasonLine = sp
      ? '<div style="font-size:11px;color:var(--sub);line-height:1.6;margin:6px 0 2px">' +
        '<b style="color:#60a5fa">🗓️ 시즌</b> 원천 ' + this._esc(sp.source_seasons.join("/") || "상시") + ' · ' + (sp.is_offseason ? "시즌오프" : "정시즌") +
        (sp.forbidden_seasons.length ? ' <span style="color:#ef4444">(금지 ' + this._esc(sp.forbidden_seasons.join("/")) + ')</span>' : '') +
        (this._last.drift_flag ? ' <span style="color:#ef4444">· ⚠시즌 점프 감지(재실행 권장)</span>' : '') + '</div>'
      : '';
    const anchorLine = a.anchor
      ? '<div style="font-size:11px;color:var(--sub);line-height:1.6;margin:6px 0 2px">' +
        '<b style="color:var(--ink)">⚓ 앵커</b> ' +
        '<span style="color:#60a5fa">①브랜드</span> ' + this._esc(a.anchor.brand || "-") + ' · ' +
        '<span style="color:#34d399">②카테고리</span> ' + this._esc(a.anchor.category || "-") + ' · ' +
        '<span style="color:#fbbf24">③제목결</span> ' + this._esc(a.anchor.title_pattern || "-") + '</div>'
      : '';
    const mini = (label, p, accent) => {
      const sc = (p.score || p.score === 0) ? '<span style="background:' + accent + ';color:#0b1020;font-weight:800;font-size:10.5px;padding:1px 8px;border-radius:10px;margin-left:auto">' + (/추천/.test(label) ? "성과 " : "참신 ") + this._esc(p.score) + '</span>' : '';
      const chips = (p.attributes || []).slice(0, 4).map(x => '<span class="enumChip on" style="border-color:' + accent + ';font-size:10px">' + this._esc(x.value) + '</span>').join("");
      return '<div style="border:1px solid var(--line2);border-left:3px solid ' + accent + ';border-radius:8px;padding:9px 10px;margin-top:8px">' +
        '<div style="display:flex;align-items:center;gap:6px;font-weight:800;font-size:12px;color:' + accent + '">' + label + sc + '</div>' +
        '<div style="font-size:11.5px;color:var(--ink);margin:3px 0 5px">' + this._esc(p.title || "") + '</div>' +
        '<div class="enumVals">' + chips + '</div></div>';
    };
    box.innerHTML =
      '<div class="rh">💡 AI PLAN <span class="ai">' + this._esc(this._last.model) + ' · 실시간</span></div>' +
      '<div class="rsum">조회 <b>' + this._last.n + '개</b> · 4-에이전트(분석→전략→크리에이티브→검수) · 앵커 기반 2-방향 제안</div>' +
      seasonLine +
      anchorLine +
      mini("✅ 추천 기획전", rec, "#22c55e") +
      mini("✨ 참신한 기획전", nov, "#f59e0b") +
      '<button class="btn" style="margin-top:10px;width:100%" onclick="AIPlanModal.open(AIPlan._last)">📋 상세 보기 (분석·장단점·컨텐츠·검수)</button>' +
      (window.AIEngine ? '<button class="btn sec" style="margin-top:7px;width:100%" onclick="openPrototypeModal()">✨ NEW 템플릿 프로토타입 프리뷰</button>' : "");
  };

  // 구버전 호환 별칭
  AIPlan._renderTabs = function () { return AIPlan._renderSummary(); };
  AIPlan.showTab = function (t) { if (this._last && window.AIPlanModal) { this._last.tab = t; window.AIPlanModal.open(this._last); } };
  window.runGeminiAnalysis = function () { return AIPlan.run(); };

  // 3) 자동 장문 휴리스틱 비활성화 → AI PLAN은 Gemini 실행 결과로 일원화
  //    (필터/검색 시 recoBox는 비워지고, 안내문구가 표시됨)
  window.renderReco = function () {
    const empty = document.getElementById("recoEmpty");
    if (empty) {
      empty.style.display = "block";
      empty.innerHTML = '좌측에서 <b>속성</b>을 선택하거나 검색해 기획전을 조회한 뒤, ' +
        '<b>[🤖 Gemini AI 분석 실행]</b>을 누르면 <b>추천/참신 기획전</b>과 <b>구성 속성</b>이 여기에 표시됩니다.';
    }
  };

  // 4) 로드 시 직전 AI PLAN 결과 복원 (새로고침해도 유지 · 재호출 없음)
  (function restoreOnLoad() {
    let tries = 0;
    const t = setInterval(function () {
      tries++;
      const box = document.getElementById("recoBox");
      if (box && AIPlan._restore()) {
        const empty = document.getElementById("recoEmpty"); if (empty) empty.style.display = "none";
        box.className = "recoBox show";
        AIPlan._renderSummary();
        clearInterval(t);
      } else if (tries > 24) clearInterval(t);
    }, 250);
  })();
})();
