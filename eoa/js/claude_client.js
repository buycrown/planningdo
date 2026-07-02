/* =========================================================
   claude_client.js — Anthropic Claude 호출 (AI 엔진 옵션)
   - 모델 드롭다운에서 'claude-*' 선택 시 GeminiClient.generate가 이 모듈로 라우팅
   - 브라우저 직접 호출: anthropic-dangerous-direct-browser-access 헤더 사용
   - 키: CONFIG.claude_api_key (data.json) — 사용자가 직접 입력(sk-ant-...)
   - 과부하(429/529/503/500) 백오프 재시도 + 대체 모델 폴백
   ⚠️ 키가 브라우저에 노출됨(내부용 도구 가정). 외부 배포 시 백엔드 프록시 권장.
   ========================================================= */
window.ClaudeClient = {
  endpoint: "https://api.anthropic.com/v1/messages",
  fallback: "claude-haiku-4-5-20251001",

  _cfg() { return (window.CONFIG && typeof window.CONFIG === "object") ? window.CONFIG : {}; },
  apiKey() { return this._cfg().claude_api_key || ""; },

  _clean(t) {
    return String(t || "")
      .replace(/^\s*```(?:json|html)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
  },

  /* GeminiClient.generate와 동일한 출력(정제된 텍스트)을 반환 */
  async generateText(prompt, opts) {
    opts = opts || {};
    const key = this.apiKey();
    if (!key) throw new Error("CONFIG.claude_api_key가 비어 있습니다. data.json에 Anthropic 키(sk-ant-...)를 넣거나, 모델을 Gemini로 변경하세요.");
    const primary = opts.model || "claude-sonnet-4-6";
    const chain = [primary];   // 자원 절약: 선택 모델만 호출(자동 대체모델 폴백 제거)
    // 최신 Claude(Opus/Sonnet/Haiku 4.x)는 temperature 파라미터를 폐기 → 전송하지 않음
    const baseBody = {
      // maxOutputTokens(우리 공통 옵션) → Claude max_tokens 매핑(미매핑 시 JSON 잘림 방지)
      max_tokens: opts.maxOutputTokens || opts.max_tokens || 4096,
      messages: [{ role: "user", content: prompt + (opts.json ? "\n\n반드시 순수 JSON만 출력하라(코드펜스/설명 금지)." : "") }],
    };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let lastMsg = "알 수 없는 오류";
    for (let mi = 0; mi < chain.length; mi++) {
      const body = Object.assign({ model: chain[mi] }, baseBody);
      for (let attempt = 0; attempt < 2; attempt++) {   // 최대 1회 재시도(호출 수 최소화)
        let res;
        try {
          res = await fetch(this.endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
              "anthropic-dangerous-direct-browser-access": "true",
            },
            body: JSON.stringify(body),
          });
        } catch (e) {
          lastMsg = "네트워크/CORS 오류: " + e.message;
          if (attempt < 1) { await sleep(900); continue; }
          break;
        }
        if (res.ok) {
          const j = await res.json();
          const text = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("");
          return this._clean(text);
        }
        let status = res.status, emsg = "HTTP " + status;
        try { const ed = await res.json(); emsg = (ed.error && ((ed.error.type ? ed.error.type + ": " : "") + ed.error.message)) || emsg; } catch (e) {}
        if (status === 401) emsg = "인증 실패(401) — claude_api_key를 확인하세요. " + emsg;
        else if (status === 429) emsg = "레이트리밋(429) — " + emsg;
        else if (status === 529 || status === 503) emsg = "모델 과부하(" + status + ") — " + emsg;
        lastMsg = emsg;
        if (status === 529 || status === 503 || status === 500) {   // 일시 과부하만 1회 재시도
          if (attempt < 1) { await sleep(1200); continue; }
          break;
        }
        if (status === 429) break;   // 레이트리밋/한도는 재시도 안 함(추가 소모 방지)
        throw new Error(emsg);       // 비재시도 오류(400/401 등)는 즉시 중단
      }
    }
    throw new Error(lastMsg + " · 재시도·대체모델 후에도 실패. 잠시 후 다시 시도하세요.");
  },
};
