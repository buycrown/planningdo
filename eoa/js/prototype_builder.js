/* =========================================================
   prototype_builder.js — AI PLAN 제안 → 기획전 페이지 프로토타입 자동 생성
   - 'NEW 템플릿 프로토타입 프리뷰'를 AI PLAN이 제안한 구성 그대로 동적 렌더
   - 템플릿 빌더 에이전트(agents/Event Template Builder.md)로 레이아웃 JSON 생성
   - 이미지는 기존 기획전(e.img) 차용, 카드 텍스트는 AI가 신규 카피로 재편
   - openPrototypeModal()을 대체 (index.html 비침투)
   ========================================================= */
window.PrototypeBuilder = {
  _agent: null,
  _cache: {},   // kind별 마지막 레이아웃 캐시

  async _loadAgent() {
    if (this._agent !== null) return;
    try { const r = await fetch("agents/Event Template Builder.md?_" + Date.now(), { cache: "no-store" }); this._agent = r.ok ? await r.text() : ""; }
    catch (e) { this._agent = ""; }
  },

  /* 프로토타입 결과 보존: 재구성 전까지 유지(모달 닫기·새로고침에도) — 재호출 방지 */
  _PROTO_KEY: "lfmall_proto_v1",
  _loadProto: function (kind) { try { var s = localStorage.getItem(this._PROTO_KEY); if (s) { var o = JSON.parse(s); return o && o[kind]; } } catch (e) {} return null; },
  _saveProto: function () { try { localStorage.setItem(this._PROTO_KEY, JSON.stringify(this._cache || {})); } catch (e) {} },
  _clearProto: function () { this._cache = {}; try { localStorage.removeItem(this._PROTO_KEY); } catch (e) {} },

  /* 제안과 연관된 기존 기획전 이미지 수집 (벤치마크 > 브랜드 > 카테고리 > 고매출 순) */
  _images(p) {
    const E = window.EVENTS || [];
    const brands = new Set((p.brands || []).concat((p.attributes || []).filter(a => a.axis === "brand").map(a => a.value)));
    const cats = new Set((p.attributes || []).filter(a => a.axis === "product").map(a => a.value));
    const imgs = [];
    const push = e => { if (e && e.img && !imgs.includes(e.img)) imgs.push(e.img); };
    if (p.benchmark) { const b = E.find(e => e.name === p.benchmark) || E.find(e => e.name && e.name.indexOf(p.benchmark) >= 0); push(b); }
    E.forEach(e => { if (imgs.length < 10 && (e.brands || []).some(b => brands.has(b))) push(e); });
    E.forEach(e => { if (imgs.length < 12 && cats.has(e.main_category)) push(e); });
    if (imgs.length < 6) E.slice().sort((a, b) => (b.sales || 0) - (a.sales || 0)).forEach(e => { if (imgs.length < 8) push(e); });
    return imgs.slice(0, 10);
  },

  /* 개선의 출발점이 되는 '원본 기획전'을 찾는다 (벤치마크 > 브랜드/카테고리 최고매출) */
  _basePlan(p) {
    const E = window.EVENTS || [];
    if (p.benchmark) {
      const b = E.find(e => e.name === p.benchmark) || E.find(e => e.name && p.benchmark && e.name.indexOf(p.benchmark) >= 0);
      if (b && (b.card_types || []).length) return b;
    }
    const brands = new Set((p.brands || []).concat((p.attributes || []).filter(a => a.axis === "brand").map(a => a.value)));
    const cats = new Set((p.attributes || []).filter(a => a.axis === "product").map(a => a.value));
    const cand = E.filter(e => (e.card_types || []).length && ((e.brands || []).some(b => brands.has(b)) || cats.has(e.main_category)));
    cand.sort((a, b) => (b.sales || 0) - (a.sales || 0));
    return cand[0] || E.filter(e => (e.card_types || []).length).sort((a, b) => (b.sales || 0) - (a.sales || 0))[0] || null;
  },

  _analysis() {
    return (window.AIPlan && AIPlan._last && AIPlan._last.data && AIPlan._last.data.analysis) || {};
  },

  _buildPrompt(p, imgs, season, base) {
    base = base || this._basePlan(p);
    const a = this._analysis();
    const proposal = {
      title: p.title, attributes: p.attributes, brands: p.brands, products: p.products,
      structure: p.structure, guide: p.guide, creative: p.creative, metrics: p.metrics,
      benchmark: p.benchmark, applied_supplement: p.applied_supplement,
    };
    const original = base ? {
      name: base.name, card_types: base.card_types || [], tabs: (base.tabs || []).slice(0, 10),
      prodCnt: base.prodCnt, visibility: base.visibility_score, complexity: base.complexity_score,
    } : null;
    return (
      (this._agent ? this._agent + "\n\n" : "") +
      "## 선택된 기획전 제안\n" + JSON.stringify(proposal, null, 1) + "\n\n" +
      "## ORIGINAL 기획전 카드 구성(개선의 출발점 — 이 골격을 기준으로)\n" + JSON.stringify(original, null, 0) + "\n\n" +
      "## 분석된 약점·보완점(이것을 '개선'으로 반영하라)\n" + JSON.stringify({ weaknesses: a.weaknesses || [], supplements: a.supplements || [], applied_supplement: p.applied_supplement || "", success_factors: a.success_factors || "" }, null, 0) + "\n\n" +
      "## 사용 가능한 기존 기획전 이미지 URL 목록 (배너 계열에만, 여기서만 선택)\n" + JSON.stringify(imgs, null, 0) + "\n\n" +
      (season ? "## 시즌 프로파일(허용/금지)\n" + JSON.stringify({ source: season.source_seasons, allowed: season.allowed_seasons, forbidden: season.forbidden_seasons, intent: season.intent }, null, 0) + "\n\n" : "") +
      "지시: 위 ORIGINAL 카드 골격을 기준으로, **약점→보완점을 해소하는 데 필요한 카드만** 추가/수정/재배치하라. " +
      "약점과 무관한 카드(룰렛·랜덤번호·공유·사은품 등)는 그 개선과 직접 관련 없으면 넣지 마라. **모든 카드를 1개씩 끼워넣는 구성은 금지**(카드 수는 원본 ±2장). " +
      "탐색성 약점이 있으면 tab_products로 탭을 분화하고 탭마다 상품을 연결하라. " +
      "추가/수정한 카드에는 그 카드가 해결하는 약점을 `improvement` 1줄로 명시하고, 최상단 `improvements_applied`에 적용한 개선을 요약하라. " +
      "카피는 시즌·브랜드·카테고리에 일관. 배너 image는 목록에서만, 상품 카드엔 image 금지(No Image). 순수 JSON만 출력."
    );
  },

  async open(kind) {
    const overlay = document.getElementById("previewModal");
    if (!overlay) return;
    if (window.AIPlanModal) window.AIPlanModal.close();   // 상세 모달과 겹침 방지
    overlay.classList.add("show");
    const mo = document.getElementById("moPreviewScreen"), pc = document.getElementById("pcPreviewScreen");
    // 데이터 소스: 신규 AI PLAN (AIPlan._last) 우선 (없으면 저장본 복원 시도)
    if (window.AIPlan && !window.AIPlan._last && window.AIPlan._restore) window.AIPlan._restore();
    const L = window.AIPlan && window.AIPlan._last;
    if (!L || !L.data) {
      const msg = '<div style="padding:40px 20px;text-align:center;color:#888;font-size:13px">먼저 <b>AI 분석 실행</b>으로 기획전 제안을 생성해 주세요.</div>';
      mo.innerHTML = pc.innerHTML = msg; return;
    }
    kind = kind || L.tab || "rec";
    const p = (kind === "novel") ? L.data.novel : L.data.recommended;
    if (!p) { mo.innerHTML = pc.innerHTML = '<div style="padding:40px;text-align:center;color:#888">제안 데이터가 없습니다.</div>'; return; }

    const tabs = this._tabBar(kind);
    const loading = tabs + '<div style="padding:48px 20px;text-align:center;color:#888;font-size:13px"><div class="spinner" style="display:inline-block;width:24px;height:24px;border:3px solid rgba(0,0,0,.1);border-radius:50%;border-top-color:#e25822;animation:spin .8s linear infinite"></div><div style="margin-top:10px">AI가 제안 구성을 기획전 페이지로 조립 중…</div></div>';
    mo.innerHTML = pc.innerHTML = loading;
    if (window.GeminiClient) GeminiClient.ensureSpinKeyframe();

    try {
      const base = this._basePlan(p);
      // 저장된 프로토타입이 있으면 재호출 없이 그대로 사용(메모리 → localStorage 순)
      let layout = this._cache[kind] || this._loadProto(kind);
      if (layout) { this._cache[kind] = layout; }
      if (!layout) {
        const imgs = this._images(p);
        try {
          await this._loadAgent();
          const prompt = this._buildPrompt(p, imgs, L.season, base);
          layout = await GeminiClient.generateJSON(prompt, { maxOutputTokens: 8192 });
        } catch (genErr) {
          // AI 호출 한도/오류 → 원본 골격 기반 로컬 자동구성으로 항상 표시
          layout = this._localLayout(p, L.season, base);
          if (typeof toast === "function") toast("AI 생성 한도/오류 → 로컬 자동구성으로 표시. ‘AI로 재구성’으로 다시 시도하세요");
        }
        layout._images = imgs;
        this._cache[kind] = layout;
        this._saveProto();
      }
      this._ctx = { kind: kind, p: p, imgs: layout._images || [], season: L.season, base: base };
      this._editLayout = JSON.parse(JSON.stringify(layout));
      this._lastEval = null;
      this._paint();
    } catch (e) {
      mo.innerHTML = pc.innerHTML = tabs + '<div style="padding:40px 20px;text-align:center;color:#e25822;font-size:12px">프로토타입 생성 실패: ' + this._esc(e.message) + '</div>';
    }
  },

  // 컨트롤(좌)·프리뷰(우) 분리 렌더
  _paint() {
    if (!this._ctx || !this._editLayout) return;
    var mo = document.getElementById("moPreviewScreen"), pc = document.getElementById("pcPreviewScreen");
    var ctrl = document.getElementById("protoControls");
    var page = this._render(this._editLayout);
    if (mo) mo.innerHTML = page; if (pc) pc.innerHTML = page;
    if (ctrl) ctrl.innerHTML = this._renderControls();
    this._cache[this._ctx.kind] = this._editLayout;   // 편집 결과 유지
    this._saveProto();                                 // 편집/순서변경도 보존(재호출 없음)
  },

  /* ---------- 카드 편집기(추가·삭제·순서변경·AI 재구성) ---------- */
  CARD_UI: [
    ["top_banner", "상단배너"], ["navi", "네비게이션"], ["tab_products", "탭형 상품"], ["emp_prod", "추천단품"],
    ["banner", "배너"], ["banner_block", "배너블록"], ["pictorial", "화보"], ["benefit", "구매혜택"],
    ["plus_benefit", "PLUS혜택"], ["coupon", "선착순쿠폰"], ["timedeal", "타임딜"], ["countdown", "카운트다운"],
    ["review", "리뷰"], ["roulette", "룰렛"], ["random_no", "랜덤번호"], ["gift", "사은품"], ["share", "공유"],
    ["text", "에디토리얼"], ["attention", "유의사항"],
  ],
  _cardLabel: function (c) { var f = this.CARD_UI.find(function (x) { return x[0] === c; }); return f ? f[1] : c; },

  // 좌측 컨트롤 패널: 소스탭 · 카드추가 · 구성순서(드래그) · LFmall 정합성 · AI 최종평가
  _renderControls: function () {
    var secs = (this._editLayout.sections || []);
    // 소스 탭(추천/참신)
    var srcTab = '<div style="display:flex;gap:6px;margin-bottom:10px">' +
      ["rec", "novel"].map(function (k) {
        var on = this._ctx.kind === k;
        return '<button onclick="PrototypeBuilder.open(\'' + k + '\')" style="flex:1;padding:7px;border:1px solid ' + (on ? "var(--accent)" : "var(--line2)") + ';border-radius:8px;cursor:pointer;font-size:11px;font-weight:800;background:' + (on ? "var(--accent)" : "transparent") + ';color:' + (on ? "#fff" : "var(--sub)") + '">' + (k === "rec" ? "✅ 추천" : "✨ 참신") + '</button>';
      }.bind(this)).join("") + '</div>';
    // 카드 추가 팔레트
    var palette = this.CARD_UI.map(function (x) {
      return '<button class="pc-addBtn" onclick="PrototypeBuilder.addCard(\'' + x[0] + '\')">+ ' + x[1] + '</button>';
    }).join("");
    // 구성 순서 (드래그 reorder + 삭제) = 순서 Preview 겸용
    var order = secs.map(function (s, i) {
      return '<div class="pc-orderRow' + (s._user ? ' user' : '') + '" draggable="true" ' +
        'ondragstart="PrototypeBuilder._drag(event,' + i + ')" ondragover="event.preventDefault()" ondrop="PrototypeBuilder._drop(event,' + i + ')">' +
        '<span class="num">' + (i + 1) + '</span><span class="grip">⠿</span>' +
        '<span class="nm">' + this._esc(this._cardLabel(s.component)) + (s._user ? ' <i style="color:var(--accent);font-style:normal;font-size:9px">추가</i>' : '') + '</span>' +
        '<b onclick="PrototypeBuilder.removeCard(' + i + ')" style="cursor:pointer;color:var(--bad);font-weight:800">✕</b></div>';
    }.bind(this)).join("");

    return srcTab +
      // 1) 카드 추가
      '<div class="pc-sec"><h4>🧩 카드 추가</h4>' +
        '<div style="display:flex;flex-wrap:wrap;gap:5px">' + palette + '</div>' +
        '<button onclick="PrototypeBuilder.regenerate()" style="margin-top:10px;width:100%;background:var(--accent);color:#fff;border:none;border-radius:8px;padding:9px;font-size:12px;font-weight:800;cursor:pointer">🤖 AI로 재구성 (내 구성 반영)</button>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:6px;line-height:1.5">카드를 추가/삭제·순서변경 후 재구성하면 AI가 카피를 채워 통합합니다.</div>' +
      '</div>' +
      // 2) 구성 순서 (드래그) — 순서 Preview
      '<div class="pc-sec"><h4>🗂️ 구성 순서 <span style="font-size:9.5px;color:var(--muted);font-weight:600">드래그로 변경 · ✕ 삭제</span></h4>' + (order || '<div style="font-size:11px;color:var(--muted)">카드 없음</div>') + '</div>' +
      // 3) LFmall 정합성 게이지
      this._simBox(this._similarity(this._editLayout)) +
      // 4) AI 최종 평가
      '<div class="pc-sec"><h4>🏅 AI 최종 평가 <span style="font-size:9.5px;color:var(--muted);font-weight:600">3인 평가단 병렬</span></h4>' +
        '<div id="pcEvalBox">' + (this._lastEval ? this._evalHtml(this._lastEval) : '<div style="font-size:11px;color:var(--muted);line-height:1.6">현재 구성에 대한 AI 평가를 받아보세요.</div>') + '</div>' +
        '<button onclick="PrototypeBuilder.evaluate()" style="margin-top:9px;width:100%;background:#111;color:#fff;border:none;border-radius:8px;padding:9px;font-size:12px;font-weight:800;cursor:pointer">🧪 이 구성 AI 평가 실행</button>' +
      '</div>';
  },

  // 사이드바용 정합성 게이지(다크 테마 호환)
  _simBox: function (sim) {
    var gc = sim.overall >= 80 ? "#22c55e" : sim.overall >= 60 ? "#84cc16" : sim.overall >= 40 ? "#f59e0b" : "#ef4444";
    var bar = function (b) {
      return '<div style="margin-top:5px"><div style="display:flex;justify-content:space-between;font-size:10px;color:var(--sub)"><span>' + b.label + '</span><b style="color:var(--ink)">' + b.v + '</b></div>' +
        '<div style="height:5px;background:var(--line2);border-radius:3px;margin-top:2px;overflow:hidden"><div style="width:' + b.v + '%;height:100%;background:' + gc + '"></div></div></div>';
    };
    return '<div class="pc-sec"><h4>📊 LFmall 정합성 <span style="margin-left:auto;font-size:16px;font-weight:900;color:' + gc + '">' + sim.overall + '<span style="font-size:10px">%</span></span></h4>' +
      sim.bars.map(bar).join("") +
      '<div style="font-size:9.5px;color:var(--muted);margin-top:7px;line-height:1.5">' +
        (sim.baseName ? '원본 「' + this._esc(sim.baseName) + '」(카드 ' + sim.baseCount + '종) 기준 · ' : '') +
        '개선 카드 ' + (sim.impCount || 0) + '개 · 현재 카드 ' + sim.distinct + '종</div></div>';
  },

  _drag: function (e, i) { this._dragIdx = i; if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; },
  _drop: function (e, i) {
    e.preventDefault();
    var a = this._editLayout.sections;
    if (this._dragIdx == null || this._dragIdx === i) return;
    var m = a.splice(this._dragIdx, 1)[0]; a.splice(i, 0, m);
    this._dragIdx = null; this._lastEval = null; this._paint();
  },
  removeCard: function (i) { this._editLayout.sections.splice(i, 1); this._lastEval = null; this._paint(); },
  addCard: function (c) { this._editLayout.sections.push(this._defaultSection(c)); this._lastEval = null; this._paint(); if (typeof toast === "function") toast(this._cardLabel(c) + " 카드 추가됨 — ‘AI로 재구성’으로 카피를 채우세요"); },

  // 실 LFmall 카드 라벨 → 프로토타입 컴포넌트
  LABEL2COMP: {
    "상단배너": "top_banner", "배너": "banner", "중간배너": "banner", "타일배너": "banner", "배너블록": "banner_block",
    "네비게이션": "navi", "탭형구성": "tab_products", "추천상품": "emp_prod", "화보형": "pictorial",
    "구매혜택": "benefit", "PLUS혜택": "plus_benefit", "멤버혜택": "plus_benefit", "선착순쿠폰": "coupon",
    "타임딜": "timedeal", "핫딜": "timedeal", "카운트다운": "countdown", "룰렛이벤트": "roulette", "랜덤번호": "random_no",
    "공유이벤트": "share", "리뷰": "review", "텍스트": "text", "유의사항": "attention", "공동구매": "benefit", "영상": "pictorial",
  },

  // AI 호출 실패 시: ORIGINAL 카드 골격 + 약점 보완을 로컬에서 자동 구성 (무API)
  _localLayout: function (p, season, base) {
    p = p || {}; base = base || this._basePlan(p) || {};
    var self = this;
    var brands = (p.brands && p.brands.length) ? p.brands : ["LFmall"];
    var prods = (p.products && p.products.length) ? p.products : ["대표 상품 A", "대표 상품 B", "대표 상품 C", "대표 상품 D"];
    var cre = p.creative || {};
    var a = this._analysis();
    var weak = (a.weaknesses || []).join(" ") + " " + (p.applied_supplement || "");
    var cm = ((p.attributes || []).filter(function (x) { return x.axis === "benefit"; }).map(function (x) { return x.value; }).find(function (v) { return /%/.test(v); }) || "").match(/\d+/);
    var coupon = cm ? cm[0] + "%" : "10%";
    var seasonLabel = (season && season.source_seasons && season.source_seasons.length) ? (season.source_seasons.join("/") + (season.is_offseason ? " 시즌오프" : "")) : "";
    function items(list) { return (list.length ? list : prods).slice(0, 6).map(function (nm, i) { return { brand: brands[i % brands.length], name: nm, sale: "" }; }); }
    var tabs = [{ name: "🔥 BEST", items: items(prods.slice(0, 6)) }];
    if (prods.length > 3) tabs.push({ name: "신상", items: items(prods.slice(3, 9)) });
    brands.slice(0, 2).forEach(function (b) { tabs.push({ name: b, items: items(prods) }); });
    tabs.push({ name: "균일가", items: items(prods) });

    // 1) ORIGINAL 카드 골격을 컴포넌트로 매핑 (중복 제거, 순서 유지)
    var origCards = [...new Set(base.card_types || [])];
    var have = {}; var sections = [];
    origCards.forEach(function (lab) {
      var c = self.LABEL2COMP[lab]; if (!c || have[c]) return; have[c] = 1;
      sections.push(self._defaultSection(c));
    });
    if (!sections.length) sections.push(this._defaultSection("top_banner"));

    // 콘텐츠 채우기(원본 유지 카드)
    var imps = [];
    sections.forEach(function (s) {
      if (s.component === "top_banner") { s.title = (cre.main_copy && cre.main_copy[0]) || p.title || s.title; s.sub = (cre.sub_copy && cre.sub_copy[0]) || s.sub; }
      if (s.component === "tab_products") s.tabs = tabs;
      if (s.component === "benefit") s.coupon = coupon;
      delete s._user;
    });

    // 2) 약점 → 필요한 카드만 '개선'으로 보강
    function ensure(comp, pos, fill, improvement) {
      if (have[comp]) return;
      have[comp] = 1; var s = self._defaultSection(comp); delete s._user;
      Object.assign(s, fill || {}); s.improvement = improvement; imps.push(improvement);
      sections.splice(pos == null ? sections.length : pos, 0, s);
    }
    var idxAfterBanner = Math.min(1, sections.length);
    if (/테마|메시지|불명확|타깃/.test(weak)) ensure("text", idxAfterBanner + 1, { heading: "이번 기획전은", body: (p.guide || cre.visual || "") }, "테마·메시지 불명확 약점 보완(에디토리얼로 컨셉 명확화)");
    if (/쿠폰|혜택|유인/.test(weak)) ensure("benefit", idxAfterBanner, { headline: "단독 구매 혜택", coupon: coupon, cond: "기간 내 구매 시" }, "쿠폰·구매유인 부족 보완(혜택 카드 추가)");
    if (/탐색|탭|복잡|상품 수|상품수/.test(weak)) ensure("tab_products", idxAfterBanner + 2, { heading: "상품 둘러보기", tabs: tabs }, "탭 부족·상품 과다로 인한 탐색성 저하 보완(탭형 상품 구성)");
    if (/긴급|마감|시즌오프|클리어런스/.test(weak + seasonLabel)) ensure("timedeal", null, { heading: "막판 타임딜", badge: "단 7일", desc: "지금이 마지막 기회" }, "긴급성 강화(시즌오프 막판 타임딜)");
    // 유의사항은 항상 마지막
    if (!have["attention"]) sections.push(this._defaultSection("attention"));
    else { var ai = sections.findIndex(function (s) { return s.component === "attention"; }); if (ai >= 0 && ai !== sections.length - 1) sections.push(sections.splice(ai, 1)[0]); }

    return {
      title: p.title || "AI 기획전", brand: brands[0], theme_color: "#e25822", season_label: seasonLabel,
      based_on: base.name || "", improvements_applied: imps,
      sections: sections, _local: true,
    };
  },

  _defaultSection: function (c) {
    var imgs = (this._editLayout && this._editLayout._images) || [];
    var D = {
      top_banner: { title: "기획전 타이틀", sub: "서브 카피", cta: "기획전 바로가기", image: imgs[0] },
      navi: { heading: "바로가기", items: ["BEST", "신상", "ACC", "균일가"] },
      tab_products: { heading: "상품 둘러보기", tabs: [{ name: "BEST", items: [{ brand: "브랜드", name: "대표 상품", sale: "" }] }] },
      emp_prod: { heading: "추천 단독 상품", item: { brand: "브랜드", name: "추천 상품", sale: "" } },
      banner: { title: "중간 배너", sub: "", image: imgs[1] || imgs[0] },
      banner_block: { heading: "테마 라인업", items: [{ label: "Theme 01", title: "테마", image: imgs[0] }] },
      pictorial: { title: "화보 카피", sub: "", image: imgs[0] },
      benefit: { headline: "구매 혜택", desc: "", coupon: "10%", cond: "조건" },
      plus_benefit: { headline: "PLUS 멤버 추가 혜택", coupon: "5%" },
      coupon: { heading: "선착순 쿠폰", amount: "1만원", cond: "선착순" },
      timedeal: { heading: "타임딜", desc: "", badge: "단 7일" },
      countdown: { heading: "마감 임박", desc: "" },
      review: { heading: "고객 후기", items: [] },
      roulette: { heading: "행운 룰렛", desc: "" },
      random_no: { heading: "랜덤번호 추첨" },
      gift: { heading: "사은품 증정", desc: "" },
      share: { heading: "공유 이벤트", desc: "" },
      text: { heading: "에디토리얼", body: "" },
      attention: { items: ["유의사항을 입력하세요"] },
    };
    var o = D[c] || {}; o.component = c; o._user = true; return o;
  },

  async regenerate() {
    if (!this._ctx) return;
    var mo = document.getElementById("moPreviewScreen"), pc = document.getElementById("pcPreviewScreen");
    mo.innerHTML = pc.innerHTML = '<div style="padding:48px 20px;text-align:center;color:#888;font-size:13px"><div class="spinner" style="display:inline-block;width:24px;height:24px;border:3px solid rgba(0,0,0,.1);border-radius:50%;border-top-color:#e25822;animation:spin .8s linear infinite"></div><div style="margin-top:10px">사용자 구성을 반영해 AI가 재구성 중…</div></div>';
    try {
      await this._loadAgent();
      var must = [...new Set(this._editLayout.sections.map(function (s) { return s.component; }))];
      var order = this._editLayout.sections.map(function (s) { return s.component; });
      var userAdded = this._editLayout.sections.filter(function (s) { return s._user; }).map(function (s) { return s.component; });
      var prompt = this._buildPrompt(this._ctx.p, this._ctx.imgs, this._ctx.season, this._ctx.base) +
        "\n\n## ★사용자 편집 반영(최우선)\n" +
        "반드시 다음 카드 컴포넌트를 **모두 포함**하라: [" + must.join(", ") + "].\n" +
        (userAdded.length ? "특히 사용자가 새로 추가한 카드: [" + userAdded.join(", ") + "] 에 어울리는 카피/콘텐츠를 충실히 채워라.\n" : "") +
        "사용자가 배치한 카드 순서를 최대한 존중하라: [" + order.join(" → ") + "].\n" +
        "기존 AI 구성을 유지·보강하면서 사용자 구성을 자연스럽게 통합하라.";
      var layout = await GeminiClient.generateJSON(prompt, { maxOutputTokens: 8192 });
      layout._images = this._ctx.imgs;
      this._cache[this._ctx.kind] = layout;
      this._editLayout = JSON.parse(JSON.stringify(layout));
      this._lastEval = null;
      this._paint();
      if (typeof toast === "function") toast("AI가 사용자 구성을 반영해 재구성했습니다");
    } catch (e) {
      this._paint();
      if (typeof toast === "function") toast("재구성 실패: " + e.message);
    }
  },

  /* ---------- AI 최종 평가 (3인 평가단 병렬) ---------- */
  _evalAgents: null,
  async _loadEvalAgents() {
    if (this._evalAgents !== null) return;
    var get = async function (p) { try { var r = await fetch(p + "?_" + Date.now(), { cache: "no-store" }); return r.ok ? await r.text() : ""; } catch (e) { return ""; } };
    var files = [
      ["Event Page Evaluator", "agents/Event Page Evaluator.md"],
      ["Event Suggestion Evaluator", "agents/Event Suggestion Evaluator.md"],
      ["Event Creative Director", "agents/Event Creative Director.md"],
    ];
    var loaded = await Promise.all(files.map(async function (f) { return { name: f[0], body: await get(f[1]) }; }));
    this._evalAgents = loaded.filter(function (a) { return a.body; });
  },

  async evaluate() {
    if (!this._ctx || !this._editLayout) return;
    var box = document.getElementById("pcEvalBox");
    if (box) box.innerHTML = '<div style="font-size:11px;color:var(--sub);padding:10px 0;text-align:center"><div class="spinner" style="display:inline-block;width:18px;height:18px;border:2px solid rgba(125,125,125,.2);border-radius:50%;border-top-color:var(--accent);animation:spin .8s linear infinite"></div><div style="margin-top:6px">3인 평가단이 구성 평가 중…</div></div>';
    if (window.GeminiClient) GeminiClient.ensureSpinKeyframe();
    try {
      await this._loadEvalAgents();
      var sim = this._similarity(this._editLayout);
      var comp = {
        title: this._editLayout.title, brand: this._editLayout.brand, season_label: this._editLayout.season_label,
        sections: (this._editLayout.sections || []).map(function (s) {
          return { card: s.component, heading: s.heading || s.title || s.headline || "", tabs: (s.tabs || []).map(function (t) { return t.name; }) };
        }),
        similarity: { overall: sim.overall, distinct_cards: sim.distinct, tabs: sim.genTabs },
      };
      var proposal = { title: this._ctx.p.title, brands: this._ctx.p.brands, season: (this._ctx.season || {}).source_seasons };
      var agents = (this._evalAgents || []).map(function (a) { return "----- [" + a.name + "] -----\n" + a.body; }).join("\n\n");
      var prompt =
        "너는 LFmall 기획전 페이지를 심사하는 **3인 평가단**이다. 아래 역할 정의를 각자 적용해 병렬로 평가한 뒤 종합하라.\n\n" + agents + "\n\n" +
        "## 평가 대상(사용자가 AI+직접 구성한 기획전 페이지)\n" + JSON.stringify(comp, null, 1) + "\n\n" +
        "## 원 제안 맥락\n" + JSON.stringify(proposal, null, 0) + "\n\n" +
        "3인(① 구성 평가자=Event Page Evaluator: 구성 완성도·동선·인게이지먼트 카드 균형·LFmall 정합성, ② 크리에이티브 디렉터: 카피/탭작명/비주얼 매력, ③ 검수자=Suggestion Evaluator: 마진·타깃·리스크)이 각각 0~100 점수와 코멘트를 내고, 이를 종합한 최종 점수를 산출하라. 순수 JSON만 출력:\n" +
        '{ "final_score": 0~100정수, "grade": "최상|상|중|하 중 1", "summary": "종합 한줄평", ' +
        '"reviewers": [ {"name":"구성 평가자","score":0~100,"comment":"1~2문장"}, {"name":"크리에이티브 디렉터","score":0~100,"comment":"1~2문장"}, {"name":"검수자","score":0~100,"comment":"1~2문장"} ], ' +
        '"strengths": ["강점1","강점2"], "improvements": ["개선1","개선2"] }';
      var d = await GeminiClient.generateJSON(prompt, { maxOutputTokens: 3072 });
      this._lastEval = d;
      if (box) box.innerHTML = this._evalHtml(d);
    } catch (e) {
      if (box) box.innerHTML = '<div style="font-size:11px;color:var(--bad);line-height:1.5">평가 실패: ' + this._esc(e.message) + '<br>(무료 쿼터 한도면 잠시 후 재시도)</div>';
    }
  },

  _evalHtml: function (d) {
    var sc = +d.final_score || 0;
    var gc = sc >= 80 ? "#22c55e" : sc >= 60 ? "#84cc16" : sc >= 40 ? "#f59e0b" : "#ef4444";
    var rev = (d.reviewers || []).map(function (r) {
      return '<div style="border-top:1px dashed var(--line2);padding-top:6px;margin-top:6px"><div style="display:flex;justify-content:space-between;font-size:11px"><b style="color:var(--ink)">' + this._esc(r.name) + '</b><b style="color:' + gc + '">' + this._esc(r.score) + '</b></div>' +
        '<div style="font-size:10.5px;color:var(--sub);line-height:1.5;margin-top:2px">' + this._esc(r.comment || "") + '</div></div>';
    }.bind(this)).join("");
    var li = function (t, arr, c) { return (arr && arr.length) ? '<div style="margin-top:7px"><b style="font-size:10.5px;color:' + c + '">' + t + '</b><ul style="margin:2px 0 0;padding-left:15px;font-size:10.5px;color:var(--sub);line-height:1.5">' + arr.map(function (x) { return "<li>" + this._esc(x) + "</li>"; }.bind(this)).join("") + "</ul></div>" : ""; }.bind(this);
    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">' +
        '<div style="font-size:30px;font-weight:900;color:' + gc + ';line-height:1">' + sc + '<span style="font-size:12px">점</span></div>' +
        '<div><div style="font-size:11px;font-weight:800;color:' + gc + '">' + this._esc(d.grade || "") + '</div>' +
        '<div style="font-size:10.5px;color:var(--sub);line-height:1.4">' + this._esc(d.summary || "") + '</div></div></div>' +
      rev + li("👍 강점", d.strengths, "#22c55e") + li("🛠️ 개선점", d.improvements, "#f59e0b");
  },

  _tabBar(kind) {
    const b = (k, label, on) =>
      '<button onclick="PrototypeBuilder.open(\'' + k + '\')" style="flex:1;padding:9px 6px;border:none;cursor:pointer;font-weight:800;font-size:12px;' +
      'background:' + (on ? "#111" : "#f3f3f3") + ';color:' + (on ? "#fff" : "#888") + '">' + label + '</button>';
    return '<div style="display:flex;gap:0;border-bottom:1px solid #e5e5e5">' +
      b("rec", "✅ 추천 기획전", kind === "rec") + b("novel", "✨ 참신한 기획전", kind === "novel") + '</div>';
  },

  /* ---------- 레이아웃 렌더 ---------- */
  _render(L) {
    this._gid = 0;   // tab_products 인스턴스 고유 id 카운터 리셋
    const color = /^#?[0-9a-fA-F]{6}$/.test(String(L.theme_color || "")) ? (L.theme_color[0] === "#" ? L.theme_color : "#" + L.theme_color) : "#e25822";
    const imgs = L._images || [];
    const sections = (L.sections || []).map((s, i) => {
      const fn = this["_c_" + (s.component || "").toLowerCase()];
      let h = fn ? fn.call(this, s, color, imgs, i) : "";
      // 개선으로 추가/수정된 카드는 '개선 적용' 배지를 위에 표시 (AI 개선안 가시화)
      if (h && s.improvement) {
        h = '<div style="border:1.5px solid #f59e0b">' +
          '<div style="background:#fffbeb;color:#92400e;font-size:10.5px;font-weight:800;padding:5px 11px;border-bottom:1px solid #fde68a">✨ 개선 적용 · ' + this._esc(s.improvement) + '</div>' + h + '</div>';
      }
      return h;
    }).join('<div style="height:10px;background:#f5f5f5"></div>');
    const seasonTag = L.season_label ? '<span style="background:' + color + ';color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:10px">' + this._esc(L.season_label) + '</span>' : '';
    // 상단 개선 요약 배너
    const imps = L.improvements_applied || [];
    const impBanner = (imps.length || L.based_on)
      ? '<div style="background:#fff7ed;border-bottom:1px solid #fed7aa;padding:10px 14px">' +
          (L.based_on ? '<div style="font-size:10.5px;color:#9a3412;margin-bottom:4px">📑 원본 「' + this._esc(L.based_on) + '」 기준으로 개선 적용</div>' : '') +
          (imps.length ? '<div style="font-size:11px;color:#7c2d12;line-height:1.6">✨ <b>적용한 개선</b><ul style="margin:3px 0 0;padding-left:16px">' + imps.slice(0, 5).map(x => '<li>' + this._esc(x) + '</li>').join("") + '</ul></div>' : '') +
        '</div>'
      : '';
    return '<div style="background:#fff;font-family:\'Malgun Gothic\',\'Apple SD Gothic Neo\',sans-serif;color:#111">' +
      '<div style="padding:10px 14px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:8px">' +
        '<b style="font-size:12.5px">🤖 ' + (L._local ? "자동구성 기획전" : "AI 개선 기획전") + '</b>' + seasonTag +
        (L._local ? '<span style="background:#9ca3af;color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:9px">로컬 구성 · AI 재구성 가능</span>' : '') +
        '<span style="margin-left:auto;font-size:10.5px;color:#aaa">' + this._esc(L.brand || "") + '</span>' +
      '</div>' +
      impBanner +
      sections + '</div>';
  },

  _img(src, alt, ratio) {
    const ph = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='400' height='300' fill='%23eeece7'/><text x='50%25' y='50%25' font-size='16' fill='%2375758a' text-anchor='middle'>LFmall</text></svg>";
    return '<img src="' + (src || ph) + '" alt="' + this._esc(alt || "") + '" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.src=\'' + ph + '\'">';
  },

  _c_top_banner(s, color, imgs) {
    const img = s.image || imgs[0];
    return '<div style="position:relative;width:100%;aspect-ratio:16/10;overflow:hidden;background:#222">' +
      this._img(img, s.title, "") +
      '<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.65))"></div>' +
      '<div style="position:absolute;left:0;right:0;bottom:0;padding:20px;color:#fff;text-align:center">' +
        (s.badge ? '<span style="display:inline-block;background:' + color + ';font-size:10px;font-weight:800;padding:3px 10px;letter-spacing:1px;margin-bottom:8px">' + this._esc(s.badge) + '</span><br>' : '') +
        '<div style="font-size:24px;font-weight:900;letter-spacing:-.5px;line-height:1.2">' + this._esc(s.title || "") + '</div>' +
        (s.sub ? '<div style="font-size:12.5px;opacity:.92;margin-top:7px;line-height:1.5">' + this._esc(s.sub) + '</div>' : '') +
        (s.cta ? '<a href="#" onclick="return false" style="display:inline-block;margin-top:14px;background:#fff;color:#111;font-size:12px;font-weight:800;padding:10px 22px;text-decoration:none">' + this._esc(s.cta) + ' →</a>' : '') +
      '</div></div>';
  },

  _c_tab_nav(s, color) {
    const tabs = (s.tabs || []).map((t, i) =>
      '<span style="flex:0 0 auto;padding:11px 14px;font-size:12px;font-weight:' + (i === 0 ? "800" : "600") + ';color:' + (i === 0 ? "#111" : "#999") + ';border-bottom:2px solid ' + (i === 0 ? color : "transparent") + '">' + this._esc(t) + '</span>').join("");
    return '<div style="display:flex;overflow-x:auto;border-bottom:1px solid #eee;padding:0 6px;background:#fff">' + tabs + '</div>';
  },

  _c_benefit(s, color) {
    return '<div style="padding:34px 20px;text-align:center;background:#fafafa">' +
      '<div style="font-size:16px;font-weight:800;letter-spacing:-.4px">' + this._esc(s.headline || "구매 혜택") + '</div>' +
      (s.desc ? '<div style="font-size:12.5px;color:#666;margin-top:6px;line-height:1.5">' + this._esc(s.desc) + '</div>' : '') +
      (s.coupon ? '<div style="margin-top:16px;font-size:40px;font-weight:900;color:' + color + ';line-height:1">' + this._esc(s.coupon) + '<span style="font-size:18px"> 쿠폰</span></div>' : '') +
      (s.cond ? '<div style="font-size:12px;color:#888;margin-top:8px">' + this._esc(s.cond) + '</div>' : '') +
      '<button style="margin-top:16px;background:#111;color:#fff;border:none;font-size:12.5px;font-weight:700;padding:12px 28px;cursor:pointer">쿠폰 받기</button>' +
      '</div>';
  },

  _c_coupon(s, color) {
    return '<div style="padding:24px 20px;background:#fff">' +
      '<div style="border:1.5px dashed ' + color + ';border-radius:10px;padding:18px;text-align:center;background:' + color + '0d">' +
        '<div style="font-size:13px;font-weight:800">' + this._esc(s.heading || "선착순 쿠폰") + '</div>' +
        (s.amount ? '<div style="font-size:28px;font-weight:900;color:' + color + ';margin-top:6px">' + this._esc(s.amount) + '</div>' : '') +
        (s.desc ? '<div style="font-size:12px;color:#666;margin-top:4px">' + this._esc(s.desc) + '</div>' : '') +
        (s.cond ? '<div style="font-size:11px;color:#999;margin-top:4px">' + this._esc(s.cond) + '</div>' : '') +
        '<button style="margin-top:12px;background:' + color + ';color:#fff;border:none;font-size:12px;font-weight:700;padding:10px 24px;cursor:pointer">다운로드</button>' +
      '</div></div>';
  },

  _c_timedeal(s, color) {
    return '<div style="padding:26px 20px;background:#111;color:#fff;text-align:center">' +
      (s.badge ? '<span style="display:inline-block;background:' + color + ';font-size:10px;font-weight:800;padding:3px 10px;margin-bottom:8px">' + this._esc(s.badge) + '</span><br>' : '') +
      '<div style="font-size:18px;font-weight:900;letter-spacing:-.4px">⏱ ' + this._esc(s.heading || "타임딜") + '</div>' +
      (s.desc ? '<div style="font-size:12.5px;opacity:.85;margin-top:7px;line-height:1.5">' + this._esc(s.desc) + '</div>' : '') +
      '<div style="display:flex;gap:6px;justify-content:center;margin-top:14px">' +
        ["23", "59", "59"].map(n => '<span style="background:#fff;color:#111;font-weight:900;font-size:16px;padding:7px 10px;border-radius:6px">' + n + '</span>').join('<span style="font-weight:900;padding-top:7px">:</span>') +
      '</div></div>';
  },

  _noimg() {
    return '<div style="width:100%;aspect-ratio:1/1;background:#f1f1f1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#bbb;gap:3px">' +
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#cfcfcf" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15l-5-5L5 21"/></svg>' +
      '<span style="font-size:10px;letter-spacing:.5px">No Image</span></div>';
  },

  _c_product_grid(s, color) {
    const items = (s.items || []).slice(0, 6).map((it, i) =>
      '<div style="border:1px solid #eee;background:#fff">' +
        this._noimg() +
        '<div style="padding:9px 10px">' +
          '<div style="font-size:11px;font-weight:800;color:#111">' + this._esc(it.brand || "") + '</div>' +
          '<div style="font-size:11px;color:#666;margin-top:2px;line-height:1.4;height:30px;overflow:hidden">' + this._esc(it.name || "") + '</div>' +
          '<div style="margin-top:5px">' +
            (it.price ? '<span style="font-size:10.5px;color:#bbb;text-decoration:line-through;margin-right:5px">' + this._esc(it.price) + '</span>' : '') +
            (it.sale ? '<span style="font-size:13px;font-weight:900;color:' + color + '">' + this._esc(it.sale) + '</span>' : '') +
          '</div></div></div>').join("");
    return '<div style="padding:22px 16px;background:#fff">' +
      '<div style="font-size:15px;font-weight:800;margin-bottom:14px;text-align:center">' + this._esc(s.heading || "대표 상품") + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">' + items + '</div></div>';
  },

  _c_banner_block(s, color, imgs) {
    const items = (s.items || []).slice(0, 4).map((it, i) =>
      '<a href="#" onclick="return false" style="position:relative;display:block;aspect-ratio:3/2;overflow:hidden;border-radius:4px;background:#ddd">' +
        this._img(it.image || imgs[(i + 1) % Math.max(1, imgs.length)], it.title) +
        '<span style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.65))"></span>' +
        '<span style="position:absolute;left:12px;bottom:12px;color:#fff;text-align:left">' +
          (it.label ? '<span style="font-size:9px;font-weight:800;color:' + color + ';text-transform:uppercase;letter-spacing:1px;display:block">' + this._esc(it.label) + '</span>' : '') +
          '<b style="font-size:14px;font-weight:800">' + this._esc(it.title || "") + '</b></span></a>').join("");
    return '<div style="padding:22px 16px;background:#fff">' +
      (s.heading ? '<div style="font-size:15px;font-weight:800;margin-bottom:14px;text-align:center">' + this._esc(s.heading) + '</div>' : '') +
      '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">' + items + '</div></div>';
  },

  /* 탭형 상품 구성 — 탭 클릭 시 해당 탭 상품 노출 (실 LFmall 탭형구성 동선) */
  _c_tab_products(s, color) {
    const gid = "pg" + (this._gid = (this._gid || 0) + 1);
    const tabs = (s.tabs || []).filter(t => t && (t.name || (t.items && t.items.length)));
    if (!tabs.length) return "";
    const tabBtns = tabs.map((t, i) =>
      '<button data-pgt="' + gid + '" data-idx="' + i + '" data-color="' + color + '" onclick="PrototypeBuilder.showProdTab(\'' + gid + '\',' + i + ')" ' +
      'style="flex:0 0 auto;padding:11px 14px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:' + (i === 0 ? "800" : "600") + ';color:' + (i === 0 ? "#111" : "#999") + ';border-bottom:2px solid ' + (i === 0 ? color : "transparent") + '">' + this._esc(t.name || ("탭 " + (i + 1))) + '</button>').join("");
    const panels = tabs.map((t, i) => {
      const items = (t.items || []).slice(0, 6).map(it =>
        '<div style="border:1px solid #eee;background:#fff">' + this._noimg() +
          '<div style="padding:9px 10px">' +
            '<div style="font-size:11px;font-weight:800;color:#111">' + this._esc(it.brand || "") + '</div>' +
            '<div style="font-size:11px;color:#666;margin-top:2px;line-height:1.4;height:30px;overflow:hidden">' + this._esc(it.name || "") + '</div>' +
            '<div style="margin-top:5px">' +
              (it.price ? '<span style="font-size:10.5px;color:#bbb;text-decoration:line-through;margin-right:5px">' + this._esc(it.price) + '</span>' : '') +
              (it.sale ? '<span style="font-size:13px;font-weight:900;color:' + color + '">' + this._esc(it.sale) + '</span>' : '') +
            '</div></div></div>').join("");
      return '<div data-pg="' + gid + '" data-idx="' + i + '" style="display:' + (i === 0 ? "grid" : "none") + ';grid-template-columns:repeat(2,1fr);gap:8px;padding:14px 16px">' +
        (items || '<div style="grid-column:1/3;text-align:center;color:#bbb;font-size:12px;padding:20px">상품 준비 중</div>') + '</div>';
    }).join("");
    return '<div style="background:#fff">' +
      (s.heading ? '<div style="font-size:14px;font-weight:800;text-align:center;padding:18px 16px 4px">' + this._esc(s.heading) + '</div>' : '') +
      '<div style="display:flex;overflow-x:auto;border-bottom:1px solid #eee;padding:0 6px">' + tabBtns + '</div>' +
      panels + '</div>';
  },

  showProdTab(gid, idx) {
    document.querySelectorAll('[data-pg="' + gid + '"]').forEach(p => { p.style.display = (+p.dataset.idx === idx) ? "grid" : "none"; });
    document.querySelectorAll('[data-pgt="' + gid + '"]').forEach(b => {
      const on = +b.dataset.idx === idx;
      b.style.color = on ? "#111" : "#999"; b.style.fontWeight = on ? "800" : "600";
      b.style.borderBottomColor = on ? (b.dataset.color || "#e25822") : "transparent";
    });
  },

  _c_countdown(s, color) {
    return '<div style="padding:22px 20px;background:#fff;text-align:center;border-top:1px solid #eee;border-bottom:1px solid #eee">' +
      '<div style="font-size:13px;font-weight:800;color:' + color + '">⏳ ' + this._esc(s.heading || "마감 임박") + '</div>' +
      (s.desc ? '<div style="font-size:11.5px;color:#888;margin-top:4px">' + this._esc(s.desc) + '</div>' : '') +
      '<div style="display:flex;gap:6px;justify-content:center;margin-top:12px">' +
        [["D", "02"], ["H", "11"], ["M", "47"], ["S", "30"]].map(p => '<div style="background:#111;color:#fff;border-radius:6px;padding:8px 10px;min-width:42px"><div style="font-size:17px;font-weight:900">' + p[1] + '</div><div style="font-size:9px;opacity:.7">' + p[0] + '</div></div>').join("") +
      '</div></div>';
  },

  _c_pictorial(s, color, imgs) {
    const img = s.image || imgs[0];
    return '<div style="position:relative;width:100%;aspect-ratio:4/5;max-height:520px;overflow:hidden;background:#222">' +
      this._img(img, s.title) +
      '<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.1),rgba(0,0,0,.55))"></div>' +
      '<div style="position:absolute;left:0;right:0;bottom:0;padding:22px;color:#fff;text-align:center">' +
        '<div style="font-size:19px;font-weight:800;letter-spacing:-.3px">' + this._esc(s.title || "") + '</div>' +
        (s.sub ? '<div style="font-size:12px;opacity:.9;margin-top:6px;line-height:1.5">' + this._esc(s.sub) + '</div>' : '') +
      '</div></div>';
  },

  _c_navi(s, color) {
    var items = (s.items || s.tabs || []).slice(0, 8);
    if (!items.length) return "";
    return '<div style="padding:16px;background:#fff;border-bottom:1px solid #eee">' +
      (s.heading ? '<div style="font-size:12px;font-weight:800;margin-bottom:10px;text-align:center">' + this._esc(s.heading) + '</div>' : '') +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">' +
      items.map(function (t) { var nm = t.name || t; return '<a href="#" onclick="return false" style="flex:0 0 auto;border:1px solid #ddd;border-radius:20px;padding:8px 15px;font-size:11.5px;color:#333;text-decoration:none;background:#fafafa">' + this._esc(nm) + '</a>'; }.bind(this)).join("") +
      '</div></div>';
  },

  _c_banner(s, color, imgs) {
    var img = s.image || imgs[1] || imgs[0];
    return '<div style="background:#fff">' +
      (s.title ? '<div style="text-align:center;padding:18px 16px 10px"><div style="font-size:16px;font-weight:800">' + this._esc(s.title) + '</div>' + (s.sub ? '<div style="font-size:12px;color:#888;margin-top:4px">' + this._esc(s.sub) + '</div>' : '') + '</div>' : '') +
      '<div style="width:100%;aspect-ratio:16/7;overflow:hidden;background:#eee">' + this._img(img, s.title) + '</div></div>';
  },

  _c_emp_prod(s, color) {
    var it = (s.item || (s.items && s.items[0]) || {});
    return '<div style="padding:24px 18px;background:#fafafa;text-align:center">' +
      (s.heading ? '<div style="font-size:13px;font-weight:800;margin-bottom:12px">' + this._esc(s.heading) + '</div>' : '') +
      '<div style="max-width:240px;margin:0 auto;border:1px solid #eee;background:#fff">' + this._noimg() +
        '<div style="padding:11px 12px">' +
          '<div style="font-size:12px;font-weight:800">' + this._esc(it.brand || "") + '</div>' +
          '<div style="font-size:12px;color:#555;margin:3px 0;line-height:1.4">' + this._esc(it.name || "추천 단독 상품") + '</div>' +
          (it.sale ? '<div style="font-size:15px;font-weight:900;color:' + color + '">' + this._esc(it.sale) + '</div>' : '') +
        '</div></div></div>';
  },

  _c_plus_benefit(s, color) {
    return '<div style="padding:22px 18px;background:#111;color:#fff;text-align:center">' +
      '<span style="display:inline-block;background:#fff;color:#111;font-weight:900;font-size:13px;padding:3px 10px;border-radius:3px;margin-bottom:8px">L+ PLUS</span>' +
      '<div style="font-size:15px;font-weight:800">' + this._esc(s.headline || s.heading || "PLUS 멤버 추가 혜택") + '</div>' +
      (s.desc ? '<div style="font-size:12px;opacity:.85;margin-top:6px;line-height:1.5">' + this._esc(s.desc) + '</div>' : '') +
      (s.coupon ? '<div style="font-size:26px;font-weight:900;color:' + color + ';margin-top:8px">' + this._esc(s.coupon) + '<span style="font-size:13px;color:#fff"> 추가적립/할인</span></div>' : '') + '</div>';
  },

  _c_random_no(s, color) {
    return '<div style="padding:24px 18px;background:#fff;text-align:center;border-top:1px solid #eee;border-bottom:1px solid #eee">' +
      '<div style="font-size:13px;font-weight:800">🎲 ' + this._esc(s.heading || "랜덤 번호 추첨 이벤트") + '</div>' +
      (s.desc ? '<div style="font-size:11.5px;color:#888;margin-top:5px">' + this._esc(s.desc) + '</div>' : '') +
      '<div style="display:flex;gap:6px;justify-content:center;margin-top:12px">' +
      ["7", "2", "4", "9"].map(function (n) { return '<span style="width:38px;height:46px;line-height:46px;border:2px solid ' + color + ';border-radius:8px;font-size:20px;font-weight:900;color:' + color + '">' + n + '</span>'; }).join("") +
      '</div><button style="margin-top:12px;background:' + color + ';color:#fff;border:none;font-size:12px;font-weight:700;padding:9px 22px;cursor:pointer">번호 받기</button></div>';
  },

  _c_review(s, color) {
    var items = (s.items || []).slice(0, 3);
    if (!items.length) items = [{ name: "재구매 의사 100%! 핏이 완벽해요", brand: "★★★★★" }, { name: "여름 데일리로 최고예요. 색감 예쁨", brand: "★★★★★" }];
    return '<div style="padding:22px 16px;background:#fafafa">' +
      '<div style="font-size:13px;font-weight:800;text-align:center;margin-bottom:12px">💬 ' + this._esc(s.heading || "고객 리얼 후기") + '</div>' +
      items.map((r) =>
        '<div style="background:#fff;border:1px solid #eee;border-radius:10px;padding:11px 13px;margin-bottom:8px">' +
          '<div style="font-size:11px;color:#f5a623;font-weight:800">' + this._esc(r.brand || "★★★★★") + '</div>' +
          '<div style="font-size:12px;color:#444;margin-top:3px;line-height:1.5">' + this._esc(r.name || r.text || "") + '</div></div>'
      ).join("") + '</div>';
  },

  _c_roulette(s, color) {
    return '<div style="padding:28px 18px;background:radial-gradient(circle at 50% 0%,' + color + '22,#fff 70%);text-align:center;border-top:1px solid #eee">' +
      '<div style="font-size:14px;font-weight:900">🎡 ' + this._esc(s.heading || "행운의 룰렛 이벤트") + '</div>' +
      (s.desc ? '<div style="font-size:11.5px;color:#777;margin-top:5px">' + this._esc(s.desc) + '</div>' : '') +
      '<div style="width:130px;height:130px;margin:14px auto;border-radius:50%;border:6px dashed ' + color + ';display:flex;align-items:center;justify-content:center;font-size:30px">🎯</div>' +
      '<button style="background:' + color + ';color:#fff;border:none;font-size:13px;font-weight:800;padding:11px 30px;border-radius:24px;cursor:pointer">룰렛 돌리기</button></div>';
  },

  _c_gift(s, color, imgs) {
    return '<div style="padding:22px 18px;background:#fff;display:flex;gap:14px;align-items:center;border-top:1px solid #eee;border-bottom:1px solid #eee">' +
      '<div style="flex:0 0 96px;width:96px;height:96px;background:#f1f1f1;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:30px">🎁</div>' +
      '<div style="flex:1"><div style="font-size:13px;font-weight:800">' + this._esc(s.heading || "구매 사은품 증정") + '</div>' +
      '<div style="font-size:12px;color:#666;margin-top:5px;line-height:1.5">' + this._esc(s.desc || "기간 내 구매 고객 대상 한정 수량 사은품을 드립니다.") + '</div>' +
      (s.cond ? '<div style="font-size:11px;color:#999;margin-top:5px">' + this._esc(s.cond) + '</div>' : '') + '</div></div>';
  },

  _c_share(s, color) {
    return '<div style="padding:22px 18px;background:#fafafa;text-align:center">' +
      '<div style="font-size:13px;font-weight:800">📣 ' + this._esc(s.heading || "공유하고 혜택 받기") + '</div>' +
      (s.desc ? '<div style="font-size:11.5px;color:#777;margin-top:5px">' + this._esc(s.desc) + '</div>' : '') +
      '<div style="display:flex;gap:10px;justify-content:center;margin-top:12px">' +
      ["💛 카카오", "🔗 링크복사", "✉️ 문자"].map(function (t) { return '<span style="border:1px solid #ddd;border-radius:20px;padding:8px 14px;font-size:11.5px;background:#fff">' + t + '</span>'; }).join("") +
      '</div></div>';
  },

  _c_text(s) {
    return '<div style="padding:30px 22px;background:#fff;text-align:center">' +
      (s.heading ? '<div style="font-size:15px;font-weight:800;margin-bottom:8px">' + this._esc(s.heading) + '</div>' : '') +
      (s.body ? '<div style="font-size:12.5px;color:#666;line-height:1.7">' + this._esc(s.body) + '</div>' : '') + '</div>';
  },

  _c_attention(s) {
    const lis = (s.items || []).map(x => '<li>' + this._esc(x) + '</li>').join("");
    return '<div style="padding:18px 20px;background:#fafafa;border-top:1px solid #eee">' +
      '<div style="font-size:12.5px;font-weight:800;margin-bottom:6px">[이벤트 유의사항]</div>' +
      '<ul style="font-size:11px;color:#888;padding-left:16px;line-height:1.7;margin:0">' + lis + '</ul></div>';
  },

  /* ---------- LFmall 기획전 유사도 점검 ---------- */
  // 1개 프로토타입 컴포넌트가 실 LFmall 카드 여러 종류를 겸할 수 있어 다대다 매핑
  COMP2CARD: {
    top_banner: ["상단배너", "배너"], banner_block: ["배너블록", "배너"], tile_banner: ["타일배너"],
    banner: ["배너"], navi: ["네비게이션"], emp_prod: ["추천상품"],
    tab_products: ["탭형구성", "네비게이션", "추천상품"], tab_nav: ["탭형구성", "네비게이션"],
    benefit: ["구매혜택"], plus_benefit: ["PLUS혜택"], coupon: ["선착순쿠폰", "PLUS혜택"],
    timedeal: ["타임딜"], countdown: ["카운트다운"], pictorial: ["화보형"], product_grid: ["추천상품"],
    text: ["텍스트"], attention: ["유의사항"], review: ["리뷰"],
    roulette: ["룰렛이벤트"], random_no: ["랜덤번호"], gift: ["사은품"], share: ["공유이벤트"],
  },

  // 실 LFmall 뉴템플릿 기획전들의 표준 카드 구성·탭 수·탭명 프로파일
  _reference() {
    if (this._ref) return this._ref;
    const E = (window.EVENTS || []).filter(e => e.is_newtmpl === "Y" && (e.card_types || []).length);
    const freq = {}, tabFreq = {}; let tabSum = 0, tabN = 0; const cardCounts = [];
    (window.EVENTS || []).forEach(e => (e.tabs || []).forEach(t => tabFreq[t] = (tabFreq[t] || 0) + 1));
    E.forEach(e => {
      const ct = [...new Set(e.card_types || [])];
      cardCounts.push(ct.length);
      ct.forEach(c => freq[c] = (freq[c] || 0) + 1);
      if ((e.tabs || []).length) { tabSum += e.tabs.length; tabN++; }
    });
    const n = E.length || 1;
    cardCounts.sort((a, b) => a - b);
    const ranked = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([c]) => c);
    const canonical = Object.entries(freq).filter(([, f]) => f / n >= 0.3).map(([c]) => c);
    this._ref = {
      canonical: canonical.length ? canonical : ["상단배너", "탭형구성", "구매혜택", "유의사항"],
      topCards: ranked.slice(0, 16),
      topTabs: Object.entries(tabFreq).sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 40),
      freq, n: E.length, medianTab: tabN ? Math.round(tabSum / tabN) : 5,
      medianCards: cardCounts.length ? cardCounts[Math.floor(cardCounts.length / 2)] : 5,
      richTarget: 8,   // 사용자가 원하는 '풍성한' 기준
    };
    return this._ref;
  },

  _similarity(L) {
    const ref = this._reference();
    const base = (this._ctx && this._ctx.base) || {};
    const baseCards = [...new Set(base.card_types || [])];
    const ESSENTIAL = ["상단배너", "탭형구성", "구매혜택", "유의사항"];
    const sections = L.sections || [];
    const gen = [...new Set(sections.flatMap(s => this.COMP2CARD[(s.component || "").toLowerCase()] || []))];
    const genSet = new Set(gen);
    // 1) 원본 구성 반영 — ORIGINAL 카드와의 일치(Jaccard). 원본 골격을 얼마나 살렸는가
    let originalScore;
    if (baseCards.length) {
      const inter = gen.filter(c => baseCards.includes(c)).length;
      const union = new Set([...gen, ...baseCards]).size || 1;
      originalScore = inter / union;
    } else {
      originalScore = Math.min(1, gen.filter(c => ref.topCards.includes(c)).length / 8);
    }
    // 2) 개선 반영 — 약점 보완 카드(improvement)가 실제로 들어갔는가
    const impCount = (L.improvements_applied || []).length || sections.filter(s => s.improvement).length;
    const improveScore = Math.min(1, impCount / 2);
    // 3) 핵심 카드 충족
    const essScore = ESSENTIAL.filter(c => genSet.has(c)).length / ESSENTIAL.length;
    // 4) 구성 적정성 — 카드 남발 방지(원본 ±2 이내면 만점, 초과할수록 감점)
    const distinct = genSet.size;
    const target = baseCards.length ? baseCards.length + 2 : 6;
    const fitScore = distinct <= target ? 1 : Math.max(0, 1 - (distinct - target) / Math.max(3, target));
    // 5) 상품-탭 연결
    const hasTabProducts = sections.some(s => (s.component || "").toLowerCase() === "tab_products" && (s.tabs || []).some(t => (t.items || []).length));
    const prodScore = hasTabProducts ? 1 : (sections.some(s => (s.component || "").toLowerCase() === "product_grid" && (s.items || []).length) ? 0.45 : 0);
    let genTabs = 0;
    sections.forEach(s => { const c = (s.component || "").toLowerCase(); if (c === "tab_products" || c === "tab_nav") genTabs = Math.max(genTabs, (s.tabs || []).length); });
    const overall = Math.round(100 * (0.30 * originalScore + 0.24 * improveScore + 0.16 * essScore + 0.14 * fitScore + 0.16 * prodScore));
    return {
      overall, refN: ref.n, medianTab: ref.medianTab, medianCards: ref.medianCards, genTabs, distinct,
      baseName: base.name || "", baseCount: baseCards.length, impCount: impCount,
      bars: [
        { label: "원본 구성 반영", v: Math.round(originalScore * 100) },
        { label: "개선 반영", v: Math.round(improveScore * 100) },
        { label: "핵심 카드 충족", v: Math.round(essScore * 100) },
        { label: "구성 적정성(과다 방지)", v: Math.round(fitScore * 100) },
        { label: "상품-탭 연결", v: Math.round(prodScore * 100) },
      ],
      genCards: gen,
    };
  },

  _similarityPanel(sim, color) {
    const grade = sim.overall >= 80 ? "매우 유사" : sim.overall >= 60 ? "유사" : sim.overall >= 40 ? "보통" : "낮음";
    const gc = sim.overall >= 80 ? "#16a34a" : sim.overall >= 60 ? "#65a30d" : sim.overall >= 40 ? "#d97706" : "#dc2626";
    const bar = b => '<div style="margin-top:5px"><div style="display:flex;justify-content:space-between;font-size:10px;color:#777"><span>' + b.label + '</span><b style="color:#333">' + b.v + '</b></div>' +
      '<div style="height:5px;background:#eee;border-radius:3px;margin-top:2px;overflow:hidden"><div style="width:' + b.v + '%;height:100%;background:' + color + '"></div></div></div>';
    return '<div style="margin:10px 12px;border:1px solid #e7e7e7;border-radius:10px;padding:11px 13px;background:#fafafa">' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<b style="font-size:12px;color:#222">📊 LFmall 기획전 유사도</b>' +
        '<span style="margin-left:auto;font-size:18px;font-weight:900;color:' + gc + '">' + sim.overall + '<span style="font-size:11px">%</span></span>' +
        '<span style="font-size:10px;font-weight:800;color:#fff;background:' + gc + ';padding:2px 8px;border-radius:9px">' + grade + '</span>' +
      '</div>' +
      sim.bars.map(bar).join("") +
      '<div style="font-size:9.5px;color:#aaa;margin-top:7px;line-height:1.5">기준: 실 LFmall 뉴템플릿 기획전 ' + sim.refN + '개 · 카드 종류 ' + sim.distinct + '개(중앙값 ' + sim.medianCards + ') · 탭 ' + sim.genTabs + '개(중앙값 ' + sim.medianTab + ')</div>' +
    '</div>';
  },

  _esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); },
};

/* AI PLAN 재실행 시 캐시 무효화 (새 제안 반영) */
(function () {
  if (window.AIPlan && AIPlan.run && !AIPlan._protoHooked) {
    const orig = AIPlan.run.bind(AIPlan);
    AIPlan.run = async function () { window.PrototypeBuilder._clearProto(); return orig(); };
    AIPlan._protoHooked = true;
  }
})();

/* 기존 버튼/호출 대체 */
window.openPrototypeModal = function (kind) { return window.PrototypeBuilder.open(kind); };
