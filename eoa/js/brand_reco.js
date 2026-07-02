/* =========================================================
   brand_reco.js — 브랜드 맞춤 추천 Gemini 연동 (기능 6-2)
   - 추천 시마다 Gemini 2.5 Pro가 해당 브랜드 기획전 이력의 온톨로지를 분석
   - 기존 brandRecommend(KB 분포 + 근접 기획전 필터)는 유지하고, 그 위에
     속성 명시형 'Gemini 브랜드 PLAN'을 덧붙임
   ========================================================= */
window.BrandReco = {
  AX: ["placement", "theme", "benefit", "product", "brand", "card", "metric"],

  async enrich() {
    const el = document.getElementById("brandInput");
    const raw = (el ? el.value : "").trim();
    if (!raw) return;
    const box = document.getElementById("brandReco");
    if (!box) return;

    const key = raw.toLowerCase();
    const matched = (window.EVENTS || []).filter(e =>
      (e.name || "").toLowerCase().includes(key) ||
      (e.kw.brand || []).some(b => b.toLowerCase().includes(key)));

    const ctx = { brand: raw, plan_count: matched.length, attributes: {}, samples: matched.slice(0, 6).map(e => ({ name: e.name, sales_manwon: e.sales, disc: e.discMin + "~" + e.discMax + "%", conv: e.convRate })) };
    this.AX.forEach(ax => { const c = {}; matched.forEach(e => (e.kw[ax] || []).forEach(v => c[v] = (c[v] || 0) + 1)); ctx.attributes[ax] = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5).map(z => z[0]); });

    GeminiClient.ensureSpinKeyframe();
    let slot = document.getElementById("brandGeminiSlot");
    if (!slot) { slot = document.createElement("div"); slot.id = "brandGeminiSlot"; slot.style.marginTop = "8px"; box.appendChild(slot); }
    slot.innerHTML = GeminiClient.spinner("Gemini 브랜드 온톨로지 분석 중…");

    try {
      const prompt =
        "브랜드 '" + raw + "'의 LFmall 기획전 맞춤 전략을 온톨로지 관점에서 제안하세요. 순수 JSON만 출력.\n" +
        "컨텍스트(실제 DB): " + JSON.stringify(ctx) + "\n" +
        '스키마: {"title":"한글 기획전명","attributes":[{"axis":"theme|benefit|product|visual|brand","value":""}],"structure":"속성A × 속성B → 기획전형태(한 줄)","why":"근거 1문장","caution":"브랜드 가치 보호 관점 주의 1문장"}\n' +
        "attributes 3~5개, 컨텍스트의 실제 속성 우선. 서술 최소화.";
      const d = await GeminiClient.generateJSON(prompt);
      const chips = (d.attributes || []).map(a => '<span class="enumChip on" style="border-color:#38bdf8">' + this._esc((a.axis ? a.axis + "·" : "") + a.value) + '</span>').join("");
      slot.innerHTML =
        '<div class="brec" style="border-top:1px dashed var(--line2);padding-top:8px">' +
          '<b style="color:#38bdf8">🤖 Gemini 브랜드 PLAN</b> · ' + this._esc(d.title || "") +
          '<div class="enumVals" style="margin:6px 0">' + chips + '</div>' +
          '<div style="font-size:11.5px;line-height:1.55"><b>🔗 연결구조</b> ' + this._esc(d.structure || "") + '</div>' +
          (d.why ? '<div style="font-size:11.5px;line-height:1.55"><b>📊 근거</b> ' + this._esc(d.why) + '</div>' : "") +
          (d.caution ? '<div style="font-size:11.5px;line-height:1.55;color:var(--sub)"><b>⚠️ 주의</b> ' + this._esc(d.caution) + '</div>' : "") +
        '</div>';
    } catch (e) {
      slot.innerHTML = '<div class="brec" style="color:var(--bad);font-size:11.5px">Gemini 분석 실패: ' + this._esc(e.message) + '</div>';
    }
  },

  _esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); },
};

/* 기존 brandRecommend 유지 + Gemini 분석 덧붙임 */
window.__origBrandRecommend = window.brandRecommend;
window.brandRecommend = function () {
  try { if (typeof window.__origBrandRecommend === "function") window.__origBrandRecommend(); } catch (e) {}
  BrandReco.enrich();
};
