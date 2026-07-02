/* =========================================================
   attr_sources.js — 통합 기획전 속성 필터 (기능 1, 통합판)
   - 기존 '조건 조합 빌더'(FACETS) + '온톨로지 속성'을 하나의 패널로 통합
   - DB에서 추출한 전 속성을 7축으로 제공: 노출구좌·테마·혜택·상품·브랜드·카드구성·성과구간
     · 숫자 범위(할인·매출·전환·유입)는 '구간 칩'으로 변환되어 동일 UI로 선택
   - 소스 A(벡터DB) / 소스 B(AI 비전 검수) 배지 구분, 다중 선택 = AND 필터
   - index.html 비침투(자체 DOM 주입). evalEvent를 래핑해 필터 적용.
   ========================================================= */
window.AttrSources = {
  A: { axes: {} },
  B: { axes: {} },
  selected: [],            // [{axis,value,source}]
  query: "",
  expanded: {},            // axis -> 전체 펼침 여부
  collapsedLimit: 18,      // 기본 노출 개수
  openGroups: { placement: true, theme: true, benefit: true, product: false, brand: false, metric: false },
  axisMeta: {
    placement: { label: "📍 노출 구좌", color: "#fb7185", desc: "LFmall 어느 구좌/탭에 노출되었는가" },
    theme:     { label: "🗓️ 테마/시즌", color: "#a78bfa", desc: "시즌·이벤트유형·테마 키워드" },
    benefit:   { label: "🎟️ 혜택/가격", color: "#fcd34d", desc: "할인구간·할인타입·쿠폰·혜택방식" },
    product:   { label: "📦 상품/구성", color: "#86efac", desc: "카테고리·규모·협업타입·멀티/단일" },
    brand:     { label: "🏷️ 브랜드", color: "#93c5fd", desc: "구성 상위 브랜드" },
    card:      { label: "🃏 카드 구성", color: "#fdba74", desc: "뉴템플릿 카드 구성(상단배너·룰렛·타임딜·탭형 등)" },
    metric:    { label: "📈 성과 구간", color: "#f9a8d4", desc: "매출·전환·유입·시인성 구간" },
  },

  async init() {
    try { const r = await fetch("attributes.json?_" + Date.now(), { cache: "no-store" }); this.A = await r.json(); }
    catch (e) { console.warn("[AttrSources] attributes.json 로드 실패", e); }
    try { const r = await fetch("ai_vision_attrs.json?_" + Date.now(), { cache: "no-store" }); if (r.ok) this.B = await r.json(); }
    catch (e) { /* 소스 B 미생성 — 정상 */ }
    this.mergeVisionIntoEvents();
    this.injectPanel();
    this.wrapEval();
    this.render();
    if (typeof render === "function") render();   // B 병합 후 카드 재렌더
  },

  /* 소스 B(AI 비전) 속성을 해당 기획전의 kw에 병합 → 필터·카드·온톨로지맵에 반영 */
  mergeVisionIntoEvents() {
    const plans = (this.B && this.B.plans) || {};
    if (!window.EVENTS) return;
    const byId = {}; window.EVENTS.forEach(e => { byId[String(e.id)] = e; });
    Object.keys(plans).forEach(pid => {
      const e = byId[pid]; if (!e || !e.kw) return;
      const m = plans[pid];
      Object.keys(m).forEach(axis => {
        if (!e.kw[axis]) e.kw[axis] = [];
        m[axis].forEach(v => { if (e.kw[axis].indexOf(v) < 0) e.kw[axis].push(v); });
      });
      e._hasVision = true;
    });
  },

  injectPanel() {
    let mount = document.getElementById("unifiedFilterMount");
    if (!mount) {
      // index.html에 마운트가 없으면 조건빌더 영역 자리에 생성
      const anchor = document.querySelector(".condArea") || document.getElementById("accGroups");
      mount = document.createElement("div");
      mount.id = "unifiedFilterMount";
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(mount, anchor);
    }
    mount.innerHTML =
      '<h2 class="sec">🧬 기획전 속성 필터 <span class="tag">통합 · 7축</span></h2>' +
      '<div style="display:flex;gap:8px;font-size:10.5px;margin:2px 0 8px;align-items:center">' +
        '<span style="display:inline-flex;align-items:center;gap:4px"><i style="width:9px;height:9px;border-radius:2px;background:#3b82f6;display:inline-block"></i>A·벡터DB</span>' +
        '<span style="display:inline-flex;align-items:center;gap:4px"><i style="width:9px;height:9px;border-radius:2px;background:#f97316;display:inline-block"></i>B·AI비전</span>' +
        '<span id="attrBcount" style="color:var(--muted);margin-left:auto"></span>' +
      '</div>' +
      '<input id="attrSearch" type="text" placeholder="속성 검색 (예: 메인롤링, 골프, 시즌오프, 매출 상)" ' +
        'style="width:100%;padding:7px 9px;border:1.5px solid var(--line2);border-radius:8px;font-size:11.5px;background:var(--card);color:var(--ink);margin-bottom:8px" ' +
        'oninput="AttrSources.setQuery(this.value)">' +
      '<div id="attrSelected"></div>' +
      '<div id="attrAxisList"></div>';
  },

  setQuery(q) {
    this.query = (q || "").trim().toLowerCase();
    if (this.query) Object.keys(this.openGroups).forEach(k => this.openGroups[k] = true);
    this.renderAxisList();
  },

  toggleGroup(ax) { this.openGroups[ax] = !this.openGroups[ax]; this.renderAxisList(); },
  expand(ax) { this.openGroups[ax] = true; this.expanded[ax] = true; this.renderAxisList(); },
  collapse(ax) { this.expanded[ax] = false; this.renderAxisList(); },

  _merged(axis) {
    const map = {};
    ((this.A.axes && this.A.axes[axis]) || []).forEach(o => { map[o.value] = { value: o.value, freq: o.freq || 1, source: "A" }; });
    ((this.B.axes && this.B.axes[axis]) || []).forEach(o => { if (map[o.value]) map[o.value].source = "AB"; else map[o.value] = { value: o.value, freq: o.freq || 1, source: "B" }; });
    return Object.values(map).sort((a, b) => b.freq - a.freq);
  },

  isSelected(axis, value) { return this.selected.some(s => s.axis === axis && s.value === value); },

  toggle(axis, value, source) {
    const i = this.selected.findIndex(s => s.axis === axis && s.value === value);
    if (i >= 0) this.selected.splice(i, 1); else this.selected.push({ axis, value, source });
    if (typeof window.mode !== "undefined") { window.mode = "filter"; window.relBase = null; }
    const q = document.getElementById("q"); if (q) q.value = "";
    this.render();
    if (typeof render === "function") render();
  },

  clear() { this.selected = []; this.render(); if (typeof render === "function") render(); },

  render() { this.renderSelected(); this.renderAxisList(); this.updateBcount(); },

  updateBcount() {
    let bc = 0;
    Object.keys(this.axisMeta).forEach(ax => { bc += ((this.B.axes && this.B.axes[ax]) || []).length; });
    const el = document.getElementById("attrBcount");
    if (el) el.textContent = bc > 0 ? ("B 속성 " + bc + "개 반영") : "B 미생성(AI 비전 검수 전)";
  },

  renderSelected() {
    const host = document.getElementById("attrSelected");
    if (!host) return;
    if (this.selected.length === 0) {
      host.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:5px 0 9px">속성을 선택하면 AND 조건으로 기획전을 필터링합니다. 미선택 시 전체 표시.</div>';
      return;
    }
    host.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;gap:5px;padding:7px;border:1px dashed var(--line2);border-radius:8px;margin-bottom:8px">' +
      '<span style="font-size:10.5px;color:var(--sub);font-weight:700;width:100%">선택 속성 (AND · ' + this.selected.length + ')</span>' +
      this.selected.map(sObj => {
        const c = (this.axisMeta[sObj.axis] || {}).color || "#888";
        const sc = sObj.source === "B" ? "#f97316" : (sObj.source === "AB" ? "#10b981" : "#3b82f6");
        return '<span class="enumChip on" style="border-color:' + c + '" onclick="AttrSources.toggle(\'' + sObj.axis + '\',\'' + this._esc(sObj.value) + '\',\'' + sObj.source + '\')">' +
          '<i style="width:7px;height:7px;border-radius:2px;background:' + sc + ';display:inline-block;margin-right:4px"></i>' + this._escHtml(sObj.value) + ' ✕</span>';
      }).join("") +
      '<button class="btn sec sm" style="margin-left:auto" onclick="AttrSources.clear()">전체 초기화</button>' +
      '</div>';
  },

  renderAxisList() {
    const host = document.getElementById("attrAxisList");
    if (!host) return;
    const q = this.query;
    host.innerHTML = Object.keys(this.axisMeta).map(axis => {
      const meta = this.axisMeta[axis];
      let items = this._merged(axis);
      const total = items.length;
      if (q) items = items.filter(it => it.value.toLowerCase().includes(q));
      const open = this.openGroups[axis];
      const limit = q ? 200 : (this.expanded[axis] ? items.length : this.collapsedLimit);
      const shown = open ? items.slice(0, limit) : [];
      const chips = shown.map(it => {
        const sc = it.source === "B" ? "#f97316" : (it.source === "AB" ? "#10b981" : "#3b82f6");
        const on = this.isSelected(axis, it.value);
        return '<span class="enumChip ' + (on ? "on" : "") + '" style="' + (on ? "border-color:" + meta.color : "") + '" ' +
          'onclick="AttrSources.toggle(\'' + axis + '\',\'' + this._esc(it.value) + '\',\'' + it.source + '\')" title="' + it.source + ' · ' + it.freq + '건">' +
          '<i style="width:6px;height:6px;border-radius:2px;background:' + sc + ';display:inline-block;margin-right:4px"></i>' + this._escHtml(it.value) + '</span>';
      }).join("");
      const selCnt = this.selected.filter(s => s.axis === axis).length;
      return '<div style="margin-bottom:7px;border:1px solid var(--line2);border-radius:9px;overflow:hidden">' +
        '<div onclick="AttrSources.toggleGroup(\'' + axis + '\')" style="cursor:pointer;display:flex;align-items:center;gap:7px;padding:8px 10px;background:var(--card)">' +
          '<i style="width:9px;height:9px;border-radius:2px;background:' + meta.color + '"></i>' +
          '<b style="font-size:11.5px;color:var(--ink)">' + meta.label + '</b>' +
          '<span style="font-size:10px;color:var(--muted)">' + total + (q ? "→" + items.length : "") + '개' + (selCnt ? " · 선택 " + selCnt : "") + '</span>' +
          '<span style="margin-left:auto;color:var(--sub);font-size:10px">' + (open ? "▲" : "▼") + '</span>' +
        '</div>' +
        (open ? '<div class="enumVals" style="padding:8px 10px">' + (chips || '<span style="font-size:11px;color:var(--muted)">검색 결과 없음</span>') +
          (items.length > shown.length
            ? '<span class="enumChip" style="cursor:pointer;border-style:dashed;font-weight:700" onclick="event.stopPropagation();AttrSources.expand(\'' + axis + '\')">+' + (items.length - shown.length) + ' 더보기 ▾</span>'
            : (this.expanded[axis] && items.length > this.collapsedLimit
              ? '<span class="enumChip" style="cursor:pointer;border-style:dashed" onclick="event.stopPropagation();AttrSources.collapse(\'' + axis + '\')">접기 ▴</span>'
              : "")) + '</div>' : "") +
      '</div>';
    }).join("");
  },

  matches(e) {
    if (!e || !e.kw) return this.selected.length === 0;
    return this.selected.every(s => (e.kw[s.axis] || []).indexOf(s.value) >= 0);
  },

  wrapEval() {
    if (this._wrapped || typeof window.evalEvent !== "function") return;
    const orig = window.evalEvent; const self = this;
    window.evalEvent = function (e, conds, logic) {
      if (!orig(e, conds, logic)) return false;
      if (self.selected.length === 0) return true;
      return self.matches(e);
    };
    this._wrapped = true;
  },

  _esc(s) { return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); },
  _escHtml(s) { return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); },
};

/* 기존 FACETS 빌더/조건 렌더를 통합 패널로 대체 (init() 호출 전에 무력화) */
window.buildAccordions = function () {};
window.renderConditions = function () {};

(function waitReady() {
  if (window.EVENTS && window.EVENTS.length && (document.getElementById("unifiedFilterMount") || document.querySelector(".condArea") || document.getElementById("accGroups"))) {
    AttrSources.init();
  } else { setTimeout(waitReady, 200); }
})();
