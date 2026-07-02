/* =========================================================
   gemini_client.js — 공통 Gemini 호출 모듈 (v4)
   - 기본 모델: gemini-2.5-flash (무료 티어, 셀렉트 기본값과 일치)
   - 모든 AI 기능(AI PLAN · NL검색 · 브랜드추천 · 온톨로지맵 갱신)이 공유
   - 매 호출 실시간 API 요청 (캐시 없음)
   ========================================================= */
window.GeminiClient = {
  endpoint: "https://generativelanguage.googleapis.com/v1beta/models/",

  _cfg() { return (window.CONFIG && typeof window.CONFIG === "object") ? window.CONFIG : {}; },

  apiKey() { return this._cfg().gemini_api_key || ""; },

  model() {
    const sel = document.getElementById("geminiModelSelect");
    return (sel && sel.value) ? sel.value : "gemini-2.5-flash";
  },

  /* 코드펜스/마크다운 래퍼 제거 */
  _clean(t) {
    return String(t || "")
      .replace(/^\s*```(?:json|html)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
  },

  /* 일반 텍스트 생성 */
  async generate(prompt, opts) {
    opts = opts || {};
    const primary = opts.model || this.model();
    // 'claude-desktop' = 수동 브릿지(API 비용 0, Pro 구독 활용)
    if (/desktop/i.test(primary) && window.ManualBridge) {
      return window.ManualBridge.request(prompt, opts);
    }
    // 선택 모델이 Claude면 ClaudeClient로 라우팅 (AI 엔진 교체) — Gemini 키 검사보다 우선
    if (/^claude/i.test(primary) && window.ClaudeClient) {
      return window.ClaudeClient.generateText(prompt, Object.assign({}, opts, { model: primary }));
    }
    // OpenRouter 무료 모델 라우팅 (Gemini 한도 대체) — 'openrouter:' 접두
    if (/^openrouter:/i.test(primary) && window.OpenRouterClient) {
      return window.OpenRouterClient.generateText(prompt, Object.assign({}, opts, { model: primary }));
    }
    const key = this.apiKey();
    if (!key) throw new Error("CONFIG.gemini_api_key가 없습니다. data.json 설정을 확인하세요.");
    // 자원 최소화: 선택 모델만 호출(불필요한 자동 flash 폴백 제거 → 호출 수 감소)
    const chain = [primary];
    const genCfg = Object.assign(
      {
        temperature: (opts.temperature != null ? opts.temperature : 0.7),
        maxOutputTokens: opts.maxOutputTokens || 8192,
      },
      opts.json ? { responseMimeType: "application/json" } : {}
    );
    // 구조화 JSON 추출에는 thinking(추론)이 비용·잘림의 주범 → json 호출은 thinking 최소화.
    // flash/lite는 완전 비활성(0), pro/3.x 계열은 최소값(128)으로 묶어 출력 예산을 보존.
    if (opts.json) {
      genCfg.thinkingConfig = { thinkingBudget: /flash|lite/i.test(primary) ? 0 : 128 };
    }
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: genCfg,
    };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let lastMsg = "알 수 없는 오류";
    for (let mi = 0; mi < chain.length; mi++) {
      const model = chain[mi];
      const url = this.endpoint + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key);
      for (let attempt = 0; attempt < 2; attempt++) {   // 최대 1회 재시도(호출 수 최소화)
        let res;
        try {
          res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        } catch (e) {
          lastMsg = "네트워크 오류(CORS/오프라인): " + e.message;
          if (attempt < 1) { await sleep(900); continue; }
          break;
        }
        if (res.ok) {
          const j = await res.json();
          const cand = j.candidates && j.candidates[0];
          const parts = cand && cand.content && cand.content.parts;
          const text = this._clean(parts ? parts.map(p => p.text || "").join("") : "");
          // 출력 토큰 초과로 잘렸으면 표시(generateJSON에서 복구 시도)
          if (cand && cand.finishReason === "MAX_TOKENS") this._lastTruncated = true;
          else this._lastTruncated = false;
          if (!text) { lastMsg = "빈 응답(finishReason=" + (cand && cand.finishReason) + ")"; if (attempt < 1) { await sleep(900); continue; } break; }
          return text;
        }
        let status = res.status, emsg = "HTTP " + status;
        try { const ed = await res.json(); emsg = (ed.error && (ed.error.status + ": " + ed.error.message)) || emsg; } catch (e) {}
        if (status === 503) emsg = "모델 일시 과부하(503) — " + emsg;
        else if (status === 429) emsg = "쿼터/레이트리밋(429) — 결제/사용량 확인. " + emsg;
        lastMsg = emsg;
        if (status === 503 || status === 500) {            // 일시 과부하만 1회 재시도
          if (attempt < 1) { await sleep(1200); continue; }
          break;
        }
        if (status === 429) break;                          // 한도 초과는 재시도 안 함(추가 소모 방지)
        throw new Error(emsg);                                                // 비재시도 오류는 즉시 중단
      }
    }
    throw new Error(lastMsg + " · 재시도·대체모델 후에도 실패. 잠시 후 다시 실행해 주세요.");
  },

  /* JSON 생성 (구조화 출력) */
  async generateJSON(prompt, opts) {
    const t = await this.generate(prompt, Object.assign({ json: true, temperature: 0.6 }, opts || {}));
    try { return JSON.parse(t); }
    catch (e) {
      // 1) 본문에서 최대 JSON 블록 추출 재시도
      const m = t.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (m) { try { return JSON.parse(m[0]); } catch (e2) {} }
      // 2) 토큰 초과로 잘린 JSON 복구(미완 토큰 절단 후 괄호/따옴표 균형 맞춰 닫기)
      const repaired = this._repairJSON(t);
      if (repaired) { try { return JSON.parse(repaired); } catch (e3) {} }
      const hint = this._lastTruncated ? " (출력이 토큰 한도로 잘렸습니다 — 모델을 Flash로 두거나 재시도해 주세요)" : "";
      throw new Error("Gemini JSON 파싱 실패" + hint + ": " + t.slice(0, 120));
    }
  },

  /* 잘린 JSON 복구: 마지막 미완 요소를 잘라내고 열린 괄호/따옴표를 닫음 */
  _repairJSON(t) {
    let s = String(t || "").trim();
    const start = s.search(/[\{\[]/);
    if (start < 0) return null;
    s = s.slice(start);
    let inStr = false, esc = false; const stack = []; let lastSafe = -1;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
      else if (c === "}" || c === "]") stack.pop();
      else if (c === "," && stack.length) lastSafe = i;   // 완결 요소 경계 후보
    }
    if (!stack.length) return null;            // 균형 OK인데 파싱 실패면 복구 대상 아님
    let body = inStr ? s.slice(0, lastSafe >= 0 ? lastSafe : s.length) : s;
    // 끝의 미완 토큰(쉼표/콜론/여는따옴표 등) 정리
    body = body.replace(/,\s*$/, "").replace(/:\s*$/, ": null").trim();
    // 잘린 시점 기준으로 남은 괄호 닫기(재계산)
    inStr = false; esc = false; const st2 = [];
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{" || c === "[") st2.push(c === "{" ? "}" : "]");
      else if (c === "}" || c === "]") st2.pop();
    }
    if (inStr) body += '"';
    while (st2.length) body += st2.pop();
    return body;
  },

  /* 공통 로딩 스피너 HTML */
  spinner(msg) {
    return '<div style="text-align:center;padding:22px 0">' +
      '<div class="spinner" style="display:inline-block;width:24px;height:24px;border:3px solid rgba(255,255,255,.12);border-radius:50%;border-top-color:var(--accent);animation:spin .8s linear infinite"></div>' +
      '<div style="font-size:11.5px;color:var(--sub);margin-top:9px">' + (msg || "Gemini 2.5 Pro 분석 중…") + '</div></div>';
  },

  ensureSpinKeyframe() {
    if (!document.getElementById("spinner-style")) {
      const st = document.createElement("style");
      st.id = "spinner-style";
      st.innerHTML = "@keyframes spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(st);
    }
  },
};
