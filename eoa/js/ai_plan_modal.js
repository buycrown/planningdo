/* =========================================================
   ai_plan_modal.js — AI PLAN 상세 팝업 (4-에이전트 결과 풀뷰)
   - 분석 요약(앵커·장점·단점·보완·성공요인)
   - 추천/참신 탭: 속성·브랜드·상품·연결구조·가이드·보완반영·크리에이티브(카피·비주얼)
     ·예상지표(시인성/복잡도/기대성과)·근거·검수
   - index.html 비침투(모달 자체 주입). AIPlan._last 구조 사용.
   ========================================================= */
window.AIPlanModal = {
  AXL: { placement: "노출구좌", theme: "테마", benefit: "혜택", product: "상품구성", brand: "브랜드", card: "카드구성", metric: "성과", visual: "비주얼" },

  inject() {
    if (document.getElementById("aiPlanModal")) return;
    const d = document.createElement("div");
    d.id = "aiPlanModal";
    d.style.cssText = "position:fixed;inset:0;background:rgba(6,9,15,.86);z-index:10003;display:none;align-items:center;justify-content:center;padding:22px";
    d.innerHTML =
      '<div style="background:var(--bg,#0f1623);border:1px solid var(--line2);border-radius:14px;max-width:980px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.6)">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:13px 18px;border-bottom:1px solid var(--line2)">' +
          '<b style="font-size:14.5px;color:var(--ink)">💡 AI PLAN 상세</b>' +
          '<span id="apmMeta" style="font-size:11px;color:var(--muted)"></span>' +
          '<button class="btn sec sm" style="margin-left:auto" onclick="AIPlanModal.close()">✕ 닫기</button>' +
        '</div>' +
        '<div id="apmBody" style="padding:16px 18px;overflow:auto"></div>' +
      '</div>';
    d.addEventListener("click", e => { if (e.target === d) AIPlanModal.close(); });
    document.body.appendChild(d);
  },

  open(last) {
    this.inject();
    if (!last || !last.data) return;
    this._last = last;
    if (!last.tab) last.tab = "rec";
    document.getElementById("aiPlanModal").style.display = "flex";
    document.getElementById("apmMeta").textContent = (last.model || "") + " · 조회 " + (last.n || 0) + "개 · 앵커 기반 4-에이전트";
    this.render();
  },

  render() {
    const d = this._last.data, tab = this._last.tab;
    document.getElementById("apmBody").innerHTML =
      this._seasonBanner(this._last.season, (d.analysis || {}).season_fit, this._last.drift_flag) +
      this._analysisBlock(d.analysis || {}) +
      this._tabs(tab) +
      '<div style="padding-top:14px">' +
        (tab === "rec" ? this._proposal("✅ 추천 기획전", d.recommended || {}, "#22c55e", true)
                       : this._proposal("✨ 참신한 기획전", d.novel || {}, "#f59e0b", false)) +
      '</div>';
  },

  _tabs(tab) {
    const b = (id, label, accent, on) =>
      '<button onclick="AIPlanModal.show(\'' + id + '\')" style="flex:1;padding:10px 6px;border:none;cursor:pointer;' +
      'border-bottom:3px solid ' + (on ? accent : "transparent") + ';background:' + (on ? "rgba(255,255,255,.06)" : "transparent") + ';' +
      'color:' + (on ? accent : "var(--sub)") + ';font-weight:800;font-size:13px;border-radius:7px 7px 0 0">' + label + '</button>';
    return '<div style="display:flex;gap:5px;margin-top:16px;border-bottom:1px solid var(--line2)">' +
      b("rec", "✅ 추천 기획전 (효율 검증형)", "#22c55e", tab === "rec") +
      b("novel", "✨ 참신한 기획전 (고연관·미사용)", "#f59e0b", tab === "novel") + '</div>';
  },

  _seasonBanner(prof, fit, driftFixed) {
    if (!prof) return "";
    const src = prof.source_seasons || [], allow = prof.allowed_seasons || [], forbid = prof.forbidden_seasons || [];
    const tag = (t, c) => '<span style="background:' + c + ';color:#0b1020;font-weight:800;font-size:10.5px;padding:2px 8px;border-radius:10px;margin-right:5px">' + this._esc(t) + '</span>';
    return '<div style="border:1px solid rgba(96,165,250,.4);background:rgba(96,165,250,.07);border-radius:10px;padding:10px 13px;margin-bottom:10px">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11.5px">' +
        '<b style="color:#60a5fa">🗓️ 시즌 정합성 가드</b>' +
        tag("원천 " + (src.join("/") || "상시"), "#60a5fa") +
        tag(prof.is_offseason ? "시즌오프" : "정시즌", prof.is_offseason ? "#f59e0b" : "#34d399") +
        (allow.length ? '<span style="color:var(--sub)">허용 ' + this._esc(allow.join("/")) + '</span>' : '') +
        (forbid.length ? '<span style="color:#ef4444">· 금지 ' + this._esc(forbid.join("/")) + '</span>' : '') +
        (driftFixed ? tag("⚠ 시즌 점프 감지 · 재실행 권장", "#ef4444") : '') +
      '</div>' +
      (fit ? '<div style="font-size:11.5px;color:var(--ink);line-height:1.6;margin-top:6px">✅ ' + this._esc(fit) + '</div>' : '') +
      '<div style="font-size:10.5px;color:var(--muted);margin-top:5px;line-height:1.5">근거: 계절성 연관규칙(시즌 윈도우) · 온톨로지 의미거리(공통조상 LCA) · 스키마 적합성(참신=중간 부조화, 시즌 점프 금지)</div>' +
    '</div>';
  },

  _analysisBlock(a) {
    const anchor = a.anchor || {};
    const chip = (c, label, val) =>
      '<div style="flex:1;min-width:180px;background:rgba(255,255,255,.03);border:1px solid var(--line2);border-left:3px solid ' + c + ';border-radius:8px;padding:8px 10px">' +
        '<div style="font-size:10.5px;font-weight:800;color:' + c + '">' + label + '</div>' +
        '<div style="font-size:11.5px;color:var(--ink);line-height:1.5;margin-top:2px">' + this._esc(val || "-") + '</div></div>';
    const list = (title, arr, c) =>
      '<div style="flex:1;min-width:200px"><div style="font-size:11px;font-weight:800;color:' + c + ';margin-bottom:4px">' + title + '</div>' +
        '<ul style="margin:0;padding-left:16px;font-size:11.5px;line-height:1.6;color:var(--ink)">' +
        (Array.isArray(arr) && arr.length ? arr.map(x => '<li>' + this._esc(x) + '</li>').join("") : '<li style="color:var(--muted)">-</li>') + '</ul></div>';
    return '<div style="border:1px solid var(--line2);border-radius:10px;padding:12px 14px;margin-bottom:6px">' +
      '<div style="font-size:12.5px;font-weight:800;color:var(--ink);margin-bottom:8px">📊 분석 요약 <span style="font-size:10.5px;color:var(--muted);font-weight:600">— Data Analyst</span></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' +
        chip("#60a5fa", "⚓ ①순위 브랜드", anchor.brand) +
        chip("#34d399", "⚓ ②순위 카테고리", anchor.category) +
        chip("#fbbf24", "⚓ ③순위 제목/테마", anchor.title_pattern) +
      '</div>' +
      '<div style="display:flex;gap:16px;flex-wrap:wrap">' +
        list("👍 장점", a.strengths, "#22c55e") +
        list("⚠️ 단점", a.weaknesses, "#ef4444") +
        list("🩹 보완점", a.supplements, "#38bdf8") +
      '</div>' +
      (a.success_factors ? '<div style="font-size:11.5px;color:var(--sub);line-height:1.6;margin-top:10px;border-top:1px dashed var(--line2);padding-top:8px"><b style="color:var(--ink)">🏆 성공요인</b> ' + this._esc(a.success_factors) + '</div>' : '') +
      '</div>';
  },

  _bar(label, v, c) {
    v = Math.max(0, Math.min(100, +v || 0));
    return '<div style="flex:1;min-width:120px"><div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--sub)"><span>' + label + '</span><b style="color:var(--ink)">' + v + '</b></div>' +
      '<div style="height:6px;background:rgba(255,255,255,.08);border-radius:4px;margin-top:3px;overflow:hidden"><div style="width:' + v + '%;height:100%;background:' + c + '"></div></div></div>';
  },

  _proposal(kind, p, accent, isRec) {
    const chips = (p.attributes || []).map(x => {
      const axl = this.AXL[x.axis] || x.axis || "";
      return '<span class="enumChip on" style="border-color:' + accent + '">' +
        (axl ? '<b style="opacity:.6;font-weight:700;margin-right:3px">' + axl + '</b>' : '') + this._esc(x.value) + '</span>';
    }).join("");
    const scoreBadge = (p.score || p.score === 0)
      ? '<span style="background:' + accent + ';color:#0b1020;font-weight:800;font-size:11.5px;padding:2px 10px;border-radius:11px">' + (isRec ? "성과 " : "참신도 ") + this._esc(p.score) + '</span>' : '';
    const ev = p.evaluation || {};
    const verdictColor = /재검토/.test(ev.verdict || "") ? "#ef4444" : "#22c55e";
    const verdictBadge = ev.verdict ? '<span style="border:1px solid ' + verdictColor + ';color:' + verdictColor + ';font-size:10.5px;font-weight:800;padding:1px 8px;border-radius:10px">' + this._esc(ev.verdict) + '</span>' : '';

    const tagList = (arr) => (arr || []).map(x => '<li>' + this._esc(x) + '</li>').join("");
    const cre = p.creative || {}, met = p.metrics || {};
    // 벤치마크 링크
    let bench = "";
    if (p.benchmark) {
      const nm = String(p.benchmark);
      const e = (window.EVENTS || []).find(x => x.name === nm) || (window.EVENTS || []).find(x => x.name && x.name.indexOf(nm) >= 0);
      bench = '<b style="color:var(--ink)">🎯 유사 사례</b> ' + (e ? '<a href="' + e.url + '" target="_blank" rel="noopener" style="color:' + accent + ';text-decoration:underline">' + this._esc(nm) + ' ↗</a>' : this._esc(nm));
    }
    const sec = (title, html) => '<div style="margin-top:12px"><div style="font-size:11.5px;font-weight:800;color:var(--ink);margin-bottom:5px">' + title + '</div>' + html + '</div>';
    const row = (label, val) => val ? '<div style="font-size:11.5px;line-height:1.6;margin:2px 0"><b style="color:var(--ink)">' + label + '</b> ' + this._esc(val) + '</div>' : '';

    return '<div style="border:1px solid var(--line2);border-left:3px solid ' + accent + ';border-radius:10px;padding:14px 16px">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">' +
        '<b style="font-size:14px;color:' + accent + '">' + kind + '</b>' + scoreBadge + verdictBadge + '</div>' +
      '<div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:8px">' + this._esc(p.title || "") + '</div>' +

      sec("🧩 구성 속성", '<div class="enumVals">' + (chips || '<span style="font-size:11px;color:var(--muted)">속성 없음</span>') + '</div>') +
      ((p.brands && p.brands.length) || (p.products && p.products.length) ?
        sec("🏷️ 핵심 브랜드 · 대표 상품군",
          '<div style="font-size:11.5px;line-height:1.7;color:var(--sub)">' +
          (p.brands && p.brands.length ? '<b style="color:var(--ink)">브랜드</b> ' + p.brands.map(b => this._esc(b)).join(", ") + '<br>' : '') +
          (p.products && p.products.length ? '<b style="color:var(--ink)">상품군</b> ' + p.products.map(b => this._esc(b)).join(", ") : '') + '</div>') : "") +

      (p.structure ? sec("🔗 연결구조", '<div style="font-size:11.5px;color:var(--sub);line-height:1.6">' + this._esc(p.structure) + '</div>') : "") +
      (p.guide ? '<div style="font-size:11.5px;line-height:1.7;background:rgba(255,255,255,.045);border:1px solid var(--line2);border-radius:8px;padding:10px;margin-top:12px">📝 ' + this._esc(p.guide) + '</div>' : '') +
      (p.applied_supplement ? '<div style="font-size:11.5px;line-height:1.6;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.4);border-radius:8px;padding:9px 10px;margin-top:8px"><b style="color:#38bdf8">🩹 반영한 보완점</b> ' + this._esc(p.applied_supplement) + '</div>' : '') +

      // 크리에이티브
      ((cre.main_copy || cre.sub_copy || cre.visual) ?
        sec("✍️ 크리에이티브 <span style=\"font-size:10px;color:var(--muted);font-weight:600\">— Creative Director</span>",
          (cre.main_copy && cre.main_copy.length ? '<div style="font-size:11px;color:var(--sub);margin-bottom:2px">메인 카피</div><ul style="margin:0 0 6px;padding-left:16px;font-size:11.5px;line-height:1.6;color:var(--ink)">' + tagList(cre.main_copy) + '</ul>' : '') +
          (cre.sub_copy && cre.sub_copy.length ? '<div style="font-size:11px;color:var(--sub);margin-bottom:2px">서브 카피</div><ul style="margin:0 0 6px;padding-left:16px;font-size:11.5px;line-height:1.6;color:var(--ink)">' + tagList(cre.sub_copy) + '</ul>' : '') +
          (cre.visual ? '<div style="font-size:11.5px;line-height:1.6;color:var(--sub)"><b style="color:var(--ink)">🎨 비주얼/UX</b> ' + this._esc(cre.visual) + '</div>' : '')) : "") +

      // 예상 지표
      ((met.visibility != null || met.complexity != null || met.expected) ?
        sec("📐 예상 지표",
          '<div style="display:flex;gap:14px;flex-wrap:wrap">' + this._bar("시인성", met.visibility, "#60a5fa") + this._bar("복잡도", met.complexity, "#f59e0b") + '</div>' +
          (met.expected ? '<div style="font-size:11.5px;color:var(--sub);margin-top:6px"><b style="color:var(--ink)">📈 기대 성과</b> ' + this._esc(met.expected) + '</div>' : '')) : "") +

      // 근거
      ((p.evidence && p.evidence.length) ? sec("📌 근거 Top " + Math.min(3, p.evidence.length),
        '<ul style="margin:0;padding-left:16px;font-size:11.5px;line-height:1.6;color:var(--ink)">' + tagList(p.evidence.slice(0, 3)) + '</ul>') : "") +

      // 방향별 근거
      '<div style="margin-top:12px;border-top:1px dashed var(--line2);padding-top:8px">' +
        row("📊 효율 근거", p.why) + row("📈 KPI", p.kpi_target) +
        row("🧲 연관성", p.why_related) + row("💡 미사용 기회", p.gap) + row("⚠️ 주의", p.risk) +
        (bench ? '<div style="font-size:11.5px;line-height:1.6;margin:2px 0">' + bench + '</div>' : "") +
      '</div>' +

      // 검수
      ((ev.risk || ev.comment) ? sec("✅ 검수 <span style=\"font-size:10px;color:var(--muted);font-weight:600\">— Suggestion Evaluator</span>",
        '<div style="font-size:11.5px;line-height:1.6;color:var(--sub)">' +
        (ev.risk ? '<b style="color:#ef4444">리스크</b> ' + this._esc(ev.risk) + '<br>' : '') +
        (ev.comment ? '<b style="color:var(--ink)">총평</b> ' + this._esc(ev.comment) : '') + '</div>') : "") +
    '</div>';
  },

  show(t) { if (this._last) { this._last.tab = t; this.render(); } },
  close() { const m = document.getElementById("aiPlanModal"); if (m) m.style.display = "none"; },
  _esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); },
};
