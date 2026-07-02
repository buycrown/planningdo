/* =========================================================
   plan_detail.js — 기획전 상세 보기 팝업 + AI INSIGHT (기획전 평가)
   - 카드의 '🔍 상세·AI INSIGHT' 버튼 → 단일 기획전의 전체 속성(전 축, 비축약) + 성과를 팝업으로
   - 'AI INSIGHT' 실행 시 plan_evaluator 에이전트(agents/plan_evaluator.md) 기준으로 Gemini가 평가
   - index.html 비침투(모달 DOM 자체 주입)
   ========================================================= */
window.PlanDetail = {
  current: null,
  _guideline: null,
  axisMeta: {
    placement: { label: "📍 노출 구좌", color: "#fb7185" },
    theme: { label: "🗓️ 테마/시즌", color: "#a78bfa" },
    benefit: { label: "🎟️ 혜택/가격", color: "#fcd34d" },
    product: { label: "📦 상품/구성", color: "#86efac" },
    brand: { label: "🏷️ 브랜드", color: "#93c5fd" },
    card: { label: "🃏 카드 구성", color: "#fdba74" },
    coupon: { label: "🎫 쿠폰 출처/유무", color: "#fca5a5" },
    pricetier: { label: "💰 가격 포지셔닝", color: "#34d399" },
    discount: { label: "🔻 할인 강도", color: "#f87171" },
    metric: { label: "📈 성과 구간", color: "#f9a8d4" },
  },

  async _loadGuideline() {
    if (this._guideline !== null) return;
    try { const r = await fetch("agents/plan_evaluator.md?_" + Date.now(), { cache: "no-store" }); this._guideline = r.ok ? await r.text() : ""; }
    catch (e) { this._guideline = ""; }
  },

  injectModal() {
    if (document.getElementById("planDetailModal")) return;
    const d = document.createElement("div");
    d.id = "planDetailModal";
    d.style.cssText = "position:fixed;inset:0;background:rgba(6,9,15,.82);z-index:10000;display:none;align-items:flex-start;justify-content:center;padding:30px 16px;overflow:auto";
    d.innerHTML =
      '<div style="background:var(--bg,#0f1623);border:1px solid var(--line2);border-radius:14px;max-width:680px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.5)">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line2)">' +
          '<b style="font-size:15px;color:var(--ink)">🔍 기획전 상세</b>' +
          '<span id="pdId" style="font-size:11.5px;color:var(--muted)"></span>' +
          '<button class="btn sec sm" style="margin-left:auto" onclick="PlanDetail.close()">✕ 닫기</button>' +
        '</div>' +
        '<div id="pdBody" style="padding:16px;max-height:74vh;overflow:auto"></div>' +
      '</div>';
    d.addEventListener("click", e => { if (e.target === d) PlanDetail.close(); });
    document.body.appendChild(d);
  },

  open(id) {
    const e = (window.EVENTS || []).find(x => String(x.id) === String(id));
    if (!e) { if (typeof toast === "function") toast("기획전을 찾을 수 없습니다."); return; }
    this.current = e;
    this.injectModal();
    this.render(e);
    document.getElementById("planDetailModal").style.display = "flex";
  },
  close() { const m = document.getElementById("planDetailModal"); if (m) m.style.display = "none"; },

  _bset(e) {
    const m = (window.AttrSources && AttrSources.B && AttrSources.B.plans && AttrSources.B.plans[String(e.id)]) || {};
    const s = new Set();
    Object.keys(m).forEach(ax => (m[ax] || []).forEach(v => s.add(ax + "|" + v)));
    return s;
  },

  render(e) {
    document.getElementById("pdId").textContent = "#" + e.id;
    const cachedInsight = this._getInsight(e.id);   // 이전 AI INSIGHT 결과(있으면 유지)
    const bset = this._bset(e);
    const axes = (window.CONFIG && CONFIG.AXES ? CONFIG.AXES.map(a => a.key) : Object.keys(this.axisMeta));
    const cfgMeta = {};
    if (window.CONFIG && CONFIG.AXES) CONFIG.AXES.forEach(a => { cfgMeta[a.key] = { label: a.label, color: a.color }; });
    const attrHtml = axes.map(ax => {
      if (ax === "card") return "";   // '🃏 카드 구성' 전용 블록과 중복 → 속성 목록에서는 제외
      const meta = this.axisMeta[ax] || cfgMeta[ax] || { label: ax, color: "#888" };
      const vals = (e.kw[ax] || []);
      if (!vals.length) return "";
      const chips = vals.map(v => {
        const isB = bset.has(ax + "|" + v);
        const sc = isB ? "#f97316" : "#3b82f6";
        return '<span class="enumChip on" style="border-color:' + meta.color + '"><i style="width:6px;height:6px;border-radius:2px;background:' + sc + ';display:inline-block;margin-right:4px"></i>' + this._esc(v) + '</span>';
      }).join("");
      return '<div style="margin-bottom:8px"><div style="font-size:10.5px;font-weight:800;color:' + meta.color + ';margin-bottom:4px">' + meta.label + ' <span style="color:var(--muted)">' + vals.length + '</span></div><div class="enumVals">' + chips + '</div></div>';
    }).join("");

    const kpi = (lab, val) => '<div style="background:var(--card);border:1px solid var(--line2);border-radius:8px;padding:7px 9px;text-align:center"><div style="font-size:10px;color:var(--sub)">' + lab + '</div><div style="font-size:13px;font-weight:800;color:var(--ink)">' + val + '</div></div>';
    const thumb = e.img
      ? '<img src="' + e.img + '" style="width:120px;height:68px;object-fit:cover;border-radius:8px;flex:none" onerror="this.style.display=\'none\'">'
      : '';
    // 구성 정보: 대상 상품 / 탭 / 카드 구성
    const partsHtml = (((e.prodCnt || 0) > 0) || (e.tabs && e.tabs.length) || (e.card_types && e.card_types.length)) ? (
      '<div style="margin-bottom:12px;border:1px solid var(--line2);border-radius:10px;padding:10px">' +
woven((e.prodCnt || 0) > 0, '<div style="font-size:11.5px;margin-bottom:8px;display:flex;align-items:center;gap:9px;flex-wrap:wrap"><b style="color:var(--ink)">🛍️ 기획전 대상 상품</b> <span style="color:var(--muted)">총 ' + (e.prodCnt || 0).toLocaleString() + '개</span><button class="btn sm" onclick="ProductModal.open(\'' + e.id + '\')">📋 전체 상품 보기 · 엑셀 다운로드</button></div>') +
woven(e.tabs && e.tabs.length, '<div style="font-size:11.5px;margin-bottom:6px"><b style="color:var(--ink)">📑 기획전 내 탭</b> <span style="color:var(--muted)">(' + (e.tabs || []).length + ')</span><div class="enumVals" style="margin-top:3px">' + (e.tabs || []).map(t => '<span class="enumChip">' + this._esc(t) + '</span>').join('') + '</div></div>') +
woven(e.card_types && e.card_types.length, '<div style="font-size:11.5px"><b style="color:var(--ink)">🃏 카드 구성</b> <span style="color:var(--muted)">(뉴템플릿 ' + (e.card_types || []).length + '종)</span><div class="enumVals" style="margin-top:3px">' + (e.card_types || []).map(c => '<span class="enumChip" style="border-color:#fdba74">' + this._esc(c) + '</span>').join('') + '</div></div>') +
      '</div>'
    ) : '';
    function woven(cond, html) { return cond ? html : ''; }

    document.getElementById("pdBody").innerHTML =
      '<div style="display:flex;gap:12px;margin-bottom:12px">' + thumb +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:15px;font-weight:800;color:var(--ink);line-height:1.3">' + this._esc(e.name) + '</div>' +
          '<div style="font-size:11.5px;color:var(--sub);margin-top:4px">' + this._esc(e.period) + ' · ' + this._esc(e.main_category) + ' · ' + this._esc(e.curation_type) + '</div>' +
          '<a href="' + e.url + '" target="_blank" rel="noopener" style="font-size:11.5px;color:var(--accent)">기획전 페이지 열기 ↗</a>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:14px">' +
        kpi("매출(만원)", (e.sales || 0).toLocaleString()) + kpi("유입수", (e.visits || 0).toLocaleString()) +
        kpi("전환율", (e.convRate || 0) + "%") + kpi("할인율", e.discMin + "~" + e.discMax + "%") +
        kpi("시인성", (e.visibility_score || 0) + "/100") + kpi("복잡도", (e.complexity_score || 0) + "/100") +
        kpi("상품수", (e.prodCnt || 0)) + kpi("브랜드수", (e.brand_count || 0)) +
      '</div>' +
      partsHtml +
      '<div style="font-size:11.5px;font-weight:800;color:var(--sub);margin-bottom:6px">🧬 전체 속성 (전 축 · 비축약 · <i style="color:#3b82f6">A</i>/<i style="color:#f97316">B</i>)</div>' +
      attrHtml +
      '<hr class="divider">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
        '<b style="font-size:13px;color:var(--ink)">🤖 AI INSIGHT</b>' +
        '<span style="font-size:10.5px;color:var(--muted)">속성·성과 기반 기획전 평가</span>' +
        '<button id="pdInsightBtn" class="btn sm" style="margin-left:auto" onclick="PlanDetail.runInsight()">' + (cachedInsight ? "AI INSIGHT 재실행" : "AI INSIGHT 분석 실행") + '</button>' +
      '</div>' +
      '<div id="pdInsight">' + (cachedInsight ? this._insightHtml(cachedInsight.data, cachedInsight.ts) : '') + '</div>';
  },

  /* ---------- AI INSIGHT 결과 보존(캐시) ---------- */
  _INSIGHT_KEY: "lfmall_insight_v1",
  _insights: null,
  _loadInsights() {
    if (this._insights) return this._insights;
    try { this._insights = JSON.parse(localStorage.getItem(this._INSIGHT_KEY)) || {}; }
    catch (e) { this._insights = {}; }
    return this._insights;
  },
  _getInsight(id) { return this._loadInsights()[String(id)]; },
  _saveInsight(id, d, ts) {
    const all = this._loadInsights();
    all[String(id)] = { data: d, ts: ts || Date.now() };
    this._insights = all;
    try { localStorage.setItem(this._INSIGHT_KEY, JSON.stringify(all)); } catch (e) { /* 용량 초과 등 무시 */ }
  },

  _insightHtml(d, ts) {
    if (!d) return "";
    const accent = (d.score >= 70) ? "#22c55e" : (d.score >= 45 ? "#f59e0b" : "#ef4444");
    const ul = (title, arr, icon) => (Array.isArray(arr) && arr.length)
      ? '<div style="margin:6px 0"><b style="font-size:11.5px;color:var(--ink)">' + icon + " " + title + '</b><ul style="margin:3px 0 0;padding-left:16px;font-size:11.5px;line-height:1.55">' + arr.map(x => '<li>' + this._esc(x) + '</li>').join("") + '</ul></div>'
      : "";
    const when = ts ? new Date(ts).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
    return '<div style="border:1px solid ' + accent + ';border-radius:10px;padding:11px;background:rgba(255,255,255,.03)">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
          '<span style="background:' + accent + ';color:#0b1020;font-weight:800;font-size:13px;padding:3px 11px;border-radius:11px">' + this._esc(d.score) + '점</span>' +
          '<b style="font-size:12px;color:var(--ink)">' + this._esc(d.verdict || "") + '</b>' +
          (when ? '<span style="margin-left:auto;font-size:10px;color:var(--muted)">🕒 ' + when + ' 분석 · 저장됨</span>' : '') +
        '</div>' +
        ul("강점", d.strengths, "💪") + ul("약점·리스크", d.weaknesses, "⚠️") + ul("개선 제안", d.improvements, "🛠️") +
        (d.navigation ? '<div style="font-size:11.5px;margin-top:6px;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.35);border-radius:8px;padding:7px 9px"><b style="color:#60a5fa">🧭 탐색성·탭 구조</b> ' + this._esc(d.navigation) + '</div>' : "") +
        (d.best_placement ? '<div style="font-size:11.5px;margin-top:6px"><b>📍 추천 노출 구좌</b> ' + this._esc(d.best_placement) + '</div>' : "") +
      '</div>';
  },

  async runInsight() {
    const e = this.current; if (!e) return;
    if (this._insightBusy) return;   // 진행 중 중복 호출 방지(불필요한 호출 차단)
    const box = document.getElementById("pdInsight");
    const btn = document.getElementById("pdInsightBtn");
    if (!window.GeminiClient) { box.innerHTML = '<div style="color:var(--bad)">GeminiClient 미로딩</div>'; return; }
    this._insightBusy = true;
    GeminiClient.ensureSpinKeyframe();
    box.innerHTML = GeminiClient.spinner("기획전 평가 분석 중…");
    if (btn) { btn.disabled = true; btn.style.opacity = ".6"; }
    try {
      await this._loadGuideline();
      const tabs = e.tabs || [], cardTypes = e.card_types || [];
      const prodPerTab = tabs.length ? Math.round((e.prodCnt || 0) / tabs.length) : (e.prodCnt || 0);
      const ctx = {
        name: e.name, category: e.main_category, curation: e.curation_type,
        attributes: {},
        structure: {
          tabs: tabs, tab_count: tabs.length,
          card_types: cardTypes, card_count: cardTypes.length, is_newtmpl: e.is_newtmpl,
          prodCnt: e.prodCnt, products_per_tab: prodPerTab, products_sample: (e.products || []).slice(0, 5),
        },
        metrics: { sales_manwon: e.sales, uv: e.visits, conv_rate_pct: e.convRate, disc: e.discMin + "~" + e.discMax + "%", visibility: e.visibility_score, complexity: e.complexity_score, prodCnt: e.prodCnt, brandCnt: e.brand_count },
      };
      ["placement", "theme", "benefit", "product", "brand", "card", "coupon", "pricetier", "discount", "metric"].forEach(ax => { ctx.attributes[ax] = e.kw[ax] || []; });
      const prompt =
        (this._guideline ? "다음 지침서를 준수하라.\n===== 지침서 =====\n" + this._guideline + "\n===== 끝 =====\n\n" : "") +
        "아래 단일 기획전을 평가하라. 순수 JSON만 출력.\n" + JSON.stringify(ctx, null, 1);
      const d = await GeminiClient.generateJSON(prompt, { maxOutputTokens: 2048 });
      const ts = Date.now();
      this._saveInsight(e.id, d, ts);                 // 결과 보존(메모리+localStorage)
      box.innerHTML = this._insightHtml(d, ts);
      if (btn) btn.textContent = "AI INSIGHT 재실행";
    } catch (err) {
      box.innerHTML = '<div style="color:var(--bad);font-size:11.5px;padding:8px;border:1px solid var(--bad);border-radius:8px">AI INSIGHT 실패: ' + this._esc(err.message) + '</div>';
    } finally {
      this._insightBusy = false;
      if (btn) { btn.disabled = false; btn.style.opacity = "1"; }
    }
  },

  _esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); },
};
