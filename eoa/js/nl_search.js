/* =========================================================
   nl_search.js — 자연어 검색 Gemini 연동 (기능 6-1)
   - 검색 시마다 Gemini 2.5 Pro가 자연어 → 온톨로지 속성으로 매핑
   - 매핑된 속성으로 기존 mode="nl" 파이프라인(nlScore) 구동 (로컬 폴백 유지)
   ========================================================= */
window.NLSearch = {
  cache: { q: null, attrs: [], intent: "" },

  vocab() {
    const out = {};
    ["placement", "theme", "benefit", "product", "brand", "card", "metric"].forEach(ax => {
      out[ax] = (((window.AttrSources && AttrSources.A.axes && AttrSources.A.axes[ax]) || []).slice(0, 24).map(o => o.value));
    });
    return out;
  },

  async run() {
    const el = document.getElementById("q");
    const q = (el ? el.value : "").trim();
    if (!q) { this.cache = { q: null, attrs: [], intent: "" }; window.mode = "filter"; if (typeof render === "function") render(); return; }

    const list = document.getElementById("list");
    GeminiClient.ensureSpinKeyframe();
    if (list) list.innerHTML = GeminiClient.spinner('"' + q + '" 자연어 → 온톨로지 속성 매핑 중…');

    try {
      const prompt =
        '사용자 자연어 검색어: "' + q + '"\n' +
        "아래 속성 어휘에서 검색 의도에 가장 부합하는 속성만 고르세요. 순수 JSON만 출력.\n" +
        "어휘: " + JSON.stringify(this.vocab()) + "\n" +
        '스키마: {"attributes":[{"axis":"theme|benefit|product|visual|brand","value":"어휘에 존재하는 값"}], "intent":"의도 한 줄"}\n' +
        "value는 반드시 어휘에 등장한 값만 사용. 3~6개.";
      const d = await GeminiClient.generateJSON(prompt);
      this.cache = { q: q, attrs: (d.attributes || []).filter(a => a && a.axis && a.value), intent: d.intent || "" };
    } catch (e) {
      this.cache = { q: q, attrs: [], intent: "", error: e.message };
      if (typeof toast === "function") toast("Gemini NL 실패 — 로컬 검색으로 폴백: " + e.message);
    }
    window.mode = "nl"; window.relBase = null;
    if (typeof render === "function") render();
    this._note();
  },

  _note() {
    const c = this.cache;
    const host = document.getElementById("modeNote");
    if (!host) return;
    if (c.attrs && c.attrs.length) {
      host.innerHTML = '🗣️ <b>Gemini 해석</b>: ' + this._esc(c.intent) + ' &nbsp;→&nbsp; ' +
        c.attrs.map(a => '<span class="enumChip on">' + this._esc(a.axis + "·" + a.value) + '</span>').join(" ");
      host.style.display = "block";
    }
  },

  _esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); },
};

/* nlScore 래핑: 활성 쿼리에 대해 Gemini 매핑 속성으로 스코어링, 없으면 원본 폴백 */
window.__origNlScore = window.nlScore;
window.nlScore = function (e, query) {
  const c = NLSearch.cache;
  if (c.q && String(query).trim() === c.q && c.attrs.length) {
    const hits = new Set(); let score = 0;
    c.attrs.forEach(a => { if ((e.kw[a.axis] || []).indexOf(a.value) >= 0) { score += 1; hits.add(a.value); } });
    return { keep: score > 0, score: score, hits: hits };
  }
  return window.__origNlScore ? window.__origNlScore(e, query) : { keep: false, score: 0, hits: new Set() };
};

window.runNL = function () { return NLSearch.run(); };
window.setNL = function (t) { const el = document.getElementById("q"); if (el) el.value = t; NLSearch.run(); };
