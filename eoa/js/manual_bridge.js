/* =========================================================
   manual_bridge.js — Claude Desktop 수동 브릿지 (API 비용 0 · Pro 구독 활용)
   - 모델 'claude-desktop' 선택 시 GeminiClient.generate가 API 대신 이 모듈로 라우팅
   - 흐름: 완성 프롬프트(MD 지침서+데이터 포함) 복사 → Claude Desktop(Pro)에 붙여넣기
            → 답(JSON) 복사 → 결과 칸에 붙여넣기 → '적용' → 툴이 렌더
   - AI PLAN · AI INSIGHT · 자연어검색 · 브랜드추천 4종 모두 동일하게 동작
   ========================================================= */
window.ManualBridge = {
  _resolve: null, _reject: null,

  injectModal() {
    if (document.getElementById("mbModal")) return;
    const d = document.createElement("div");
    d.id = "mbModal";
    d.style.cssText = "position:fixed;inset:0;background:rgba(6,9,15,.85);z-index:10001;display:none;align-items:center;justify-content:center;padding:24px";
    d.innerHTML =
      '<div style="background:var(--bg,#0f1623);border:1px solid var(--line2);border-radius:14px;max-width:760px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.5)">' +
        '<div style="display:flex;align-items:center;gap:8px;padding:13px 16px;border-bottom:1px solid var(--line2)">' +
          '<b style="font-size:14px;color:var(--ink)">🖥️ Claude Desktop 수동 분석</b>' +
          '<span style="font-size:10.5px;color:var(--muted)">API 비용 없이 Pro 구독으로</span>' +
          '<button class="btn sec sm" style="margin-left:auto" onclick="ManualBridge.cancel()">✕ 취소</button>' +
        '</div>' +
        '<div style="padding:14px 16px;overflow:auto">' +
          '<div style="font-size:11.5px;color:var(--sub);line-height:1.6;margin-bottom:8px">' +
            '<b>① 아래 프롬프트를 복사</b>해 Claude Desktop(또는 claude.ai)에 붙여넣고 → <b>② 답(JSON)을 복사</b>해 → <b>③ 아래 결과 칸에 붙여넣고 [적용]</b>을 누르세요.</div>' +
          '<div style="display:flex;gap:6px;margin-bottom:5px">' +
            '<button class="btn sm" onclick="ManualBridge.copyPrompt()">📋 프롬프트 복사</button>' +
            '<a class="btn sm sec" href="https://claude.ai/new" target="_blank" rel="noopener" style="text-decoration:none">↗ claude.ai 새 대화</a>' +
          '</div>' +
          '<textarea id="mbPrompt" readonly style="width:100%;height:150px;font-size:11px;font-family:monospace;background:var(--card);color:var(--ink);border:1px solid var(--line2);border-radius:8px;padding:8px;resize:vertical"></textarea>' +
          '<div style="font-size:11.5px;font-weight:700;color:var(--ink);margin:12px 0 5px">③ Claude의 답(JSON)을 여기에 붙여넣기</div>' +
          '<textarea id="mbResult" placeholder="여기에 Claude Desktop 결과(JSON)를 붙여넣으세요" style="width:100%;height:120px;font-size:11px;font-family:monospace;background:var(--card);color:var(--ink);border:1px solid var(--line2);border-radius:8px;padding:8px;resize:vertical"></textarea>' +
          '<div style="display:flex;gap:7px;margin-top:10px">' +
            '<button class="btn" style="flex:1" onclick="ManualBridge.apply()">✅ 결과 적용</button>' +
            '<button class="btn sec" onclick="ManualBridge.cancel()">취소</button>' +
          '</div>' +
          '<div style="font-size:10.5px;color:var(--muted);margin-top:7px">팁: Claude가 코드블록(```json)으로 감싸도 그대로 붙여넣으면 자동 인식됩니다.</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(d);
  },

  /* GeminiClient.generate가 호출 — 프롬프트 텍스트를 받아 사용자가 붙여넣은 결과 텍스트를 반환 */
  request(prompt, opts) {
    this.injectModal();
    const full = String(prompt || "") + ((opts && opts.json) ? "\n\n반드시 순수 JSON만 출력하라(설명/코드펜스 없이)." : "");
    document.getElementById("mbPrompt").value = full;
    document.getElementById("mbResult").value = "";
    document.getElementById("mbModal").style.display = "flex";
    setTimeout(() => { const r = document.getElementById("mbResult"); if (r) r.focus(); }, 100);
    const self = this;
    // 이전 대기 요청이 있으면 취소
    if (self._reject) { const rj = self._reject; self._resolve = null; self._reject = null; rj(new Error("새 요청으로 대체됨")); }
    return new Promise((resolve, reject) => { self._resolve = resolve; self._reject = reject; });
  },

  copyPrompt() {
    const t = document.getElementById("mbPrompt");
    const ok = () => { if (typeof toast === "function") toast("프롬프트 복사됨 — Claude Desktop에 붙여넣으세요"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(ok, () => { t.select(); document.execCommand("copy"); ok(); });
    else { t.select(); document.execCommand("copy"); ok(); }
  },

  apply() {
    const r = (document.getElementById("mbResult").value || "").trim();
    if (!r) { if (typeof toast === "function") toast("Claude 결과(JSON)를 붙여넣어 주세요."); return; }
    this.close();
    if (this._resolve) { const f = this._resolve; this._resolve = null; this._reject = null; f(r); }
  },

  cancel() {
    this.close();
    if (this._reject) { const f = this._reject; this._resolve = null; this._reject = null; f(new Error("수동 분석이 취소되었습니다.")); }
  },

  close() { const m = document.getElementById("mbModal"); if (m) m.style.display = "none"; },
};

/* 기본 엔진 = Gemini 2.5 Flash (무료·자동). Claude Desktop(수동)은 '선택 옵션'으로만 유지 */
(function ensureModelDefault() {
  const sel = document.getElementById("geminiModelSelect");
  if (sel && sel.options.length > 0) {
    if (![...sel.options].some(o => o.value === "claude-desktop")) {
      const opt = document.createElement("option");
      opt.value = "claude-desktop";
      opt.textContent = "Claude Desktop (수동·Pro)";
      sel.appendChild(opt);   // 끝에 옵션으로만 추가
    }
    // 기본 선택 모델: Claude 연결 시 Claude Sonnet 우선, 없으면 무료 Flash
    if (!sel.dataset.userPicked) {
      const has = v => [...sel.options].some(o => o.value === v);
      const claudeReady = !!(window.CONFIG && (window.CONFIG.claude_api_key || "").trim());
      if (claudeReady && has("claude-opus-4-7")) sel.value = "claude-opus-4-7";
      else if (claudeReady && has("claude-sonnet-4-6")) sel.value = "claude-sonnet-4-6";
      else if (has("gemini-2.5-flash")) sel.value = "gemini-2.5-flash";
    }
  } else {
    setTimeout(ensureModelDefault, 200);
  }
})();
