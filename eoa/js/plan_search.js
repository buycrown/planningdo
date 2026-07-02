/* =========================================================
   plan_search.js — 기획전 번호(PLAN_SQ) 검색 (좌측 검색 블록)
   - LST_PLAN의 PLAN_SQ(=EVENTS.id)로 단일 기획전을 즉시 조회
   - evalEvent를 래핑하여 번호 지정 시 해당 기획전만 노출. index.html 비침투.
   ========================================================= */
window.PlanSearch = {
  planId: null,
  _wrapped: false,

  init() {
    const aside = document.querySelector("aside.panel");
    if (!aside || document.getElementById("planNoBlock")) return;
    const block = document.createElement("div");
    block.id = "planNoBlock";
    block.innerHTML =
      '<h2 class="sec">🔢 기획전 번호 검색 <span class="tag">PLAN_SQ</span></h2>' +
      '<div class="searchbox">' +
        '<input id="planNoInput" type="text" inputmode="numeric" placeholder="예: 111405" ' +
          'onkeydown="if(event.key===\'Enter\')PlanSearch.run()">' +
        '<button class="btn" onclick="PlanSearch.run()">조회</button>' +
      '</div>' +
      '<div id="planNoMsg" class="hint" style="margin-top:5px;line-height:1.5"></div>' +
      '<hr class="divider">';
    aside.insertBefore(block, aside.firstChild);
    this.wrap();
  },

  wrap() {
    if (this._wrapped || typeof window.evalEvent !== "function") return;
    const prev = window.evalEvent, self = this;
    window.evalEvent = function (e, conds, logic) {
      if (self.planId) return String(e.id) === String(self.planId);
      return prev(e, conds, logic);
    };
    this._wrapped = true;
  },

  run() {
    const el = document.getElementById("planNoInput");
    const raw = (el ? el.value : "").trim().replace(/[^0-9]/g, "");
    const msg = document.getElementById("planNoMsg");
    if (!raw) {
      this.planId = null; if (msg) msg.textContent = "";
      window.mode = "filter"; if (typeof render === "function") render(); return;
    }
    const e = (window.EVENTS || []).find(x => String(x.id) === raw);
    if (!e) {
      this.planId = null;
      if (msg) msg.innerHTML = '<span style="color:var(--bad)">#' + raw + ' 기획전을 찾을 수 없습니다(노출중이 아니거나 번호 오류).</span>';
      if (typeof render === "function") render();
      return;
    }
    this.planId = raw;
    // 다른 필터/검색 초기화 (번호 검색 우선)
    if (window.AttrSources) { AttrSources.selected = []; if (AttrSources.render) AttrSources.render(); }
    if (window.PlanSearch) {}
    window.conditions = []; window.mode = "filter"; window.relBase = null; window.brandCtx = null;
    const q = document.getElementById("q"); if (q) q.value = "";
    if (msg) msg.innerHTML = '✅ #' + raw + ' · <b>' + this._esc(e.name) + '</b>' +
      ' <span class="x" style="cursor:pointer;color:var(--accent)" onclick="PlanSearch.clear()">[해제]</span>';
    if (typeof render === "function") render();
    const list = document.getElementById("list"); if (list) list.scrollTo({ top: 0, behavior: "smooth" });
  },

  clear() {
    this.planId = null;
    const el = document.getElementById("planNoInput"); if (el) el.value = "";
    const msg = document.getElementById("planNoMsg"); if (msg) msg.textContent = "";
    window.mode = "filter"; if (typeof render === "function") render();
  },

  _esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); },
};

(function waitReady() {
  if (window.EVENTS && window.EVENTS.length && document.querySelector("aside.panel")) PlanSearch.init();
  else setTimeout(waitReady, 200);
})();
