/* =========================================================
   openrouter_client.js — OpenRouter 무료 모델 연동 (Gemini 한도 대체)
   - 브라우저 직접 호출(OpenAI 호환 · CORS 허용) · 무료 모델(:free) 사용
   - 모델 셀렉트에 'OpenRouter 무료' 그룹을 동적 추가(실시간 무료모델 목록)
   - data.json CONFIG.openrouter_api_key 필요(무료 키)
   - gemini_client.generate()가 model이 'openrouter:'로 시작하면 이리로 라우팅
   ========================================================= */
window.OpenRouterClient = {
  endpoint: "https://openrouter.ai/api/v1/chat/completions",
  HARDCODED_FREE: [
    "deepseek/deepseek-chat-v3-0324:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemini-2.0-flash-exp:free",
    "qwen/qwen-2.5-72b-instruct:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
  ],
  _freeIds: null,

  _cfg() { return (window.CONFIG && typeof window.CONFIG === "object") ? window.CONFIG : {}; },
  apiKey() { return (this._cfg().openrouter_api_key || "").trim(); },
  model() { const s = document.getElementById("geminiModelSelect"); return (s && s.value) ? s.value : ""; },
  _clean(t) { return String(t || "").replace(/^\s*```(?:json|html)?\s*/i, "").replace(/```\s*$/i, "").trim(); },

  async generateText(prompt, opts) {
    opts = opts || {};
    const key = this.apiKey();
    if (!key) throw new Error("CONFIG.openrouter_api_key가 없습니다. data.json에 무료 OpenRouter 키(sk-or-…)를 넣어주세요.");
    const primary = (opts.model || this.model()).replace(/^openrouter:/i, "");
    const fb = (this._freeIds && this._freeIds.length ? this._freeIds : this.HARDCODED_FREE);
    const chain = [primary].concat(fb.filter(m => m !== primary)).slice(0, 4);
    const base = {
      messages: [{ role: "user", content: prompt }],
      temperature: (opts.temperature != null ? opts.temperature : 0.6),
      max_tokens: opts.maxOutputTokens || 4096,
    };
    if (opts.json) base.response_format = { type: "json_object" };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let lastMsg = "알 수 없는 오류";
    for (let mi = 0; mi < chain.length; mi++) {
      const model = chain[mi];
      for (let attempt = 0; attempt < 2; attempt++) {
        let res;
        try {
          res = await fetch(this.endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + key,
              "HTTP-Referer": location.origin || "http://127.0.0.1:5500",
              "X-Title": "LFmall Exhibition Analyzer",
            },
            body: JSON.stringify(Object.assign({ model: model }, base)),
          });
        } catch (e) {
          lastMsg = "네트워크/CORS 오류: " + e.message;
          if (attempt < 1) { await sleep(800); continue; }
          break;
        }
        if (res.ok) {
          const j = await res.json();
          const t = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
          if (t) return this._clean(t);
          lastMsg = "빈 응답"; break;
        }
        let emsg = "HTTP " + res.status;
        try { const ed = await res.json(); emsg = (ed.error && (ed.error.message || ed.error.code)) || emsg; } catch (e) {}
        if (res.status === 429) emsg = "OpenRouter 무료 한도/레이트리밋(429) — " + emsg;
        lastMsg = emsg;
        if (res.status === 429 || res.status === 502 || res.status === 503) {
          if (attempt < 1) { await sleep(1200 * (attempt + 1)); continue; }
          break;  // 다음 무료 모델로 폴백
        }
        throw new Error(emsg);  // 401(키 오류) 등은 즉시 중단
      }
    }
    throw new Error(lastMsg + " · OpenRouter 무료모델 재시도·폴백 후에도 실패. 잠시 후 다시 실행해 주세요.");
  },

  /* 셀렉트에 'OpenRouter 무료' 모델 그룹 동적 추가 */
  async _populate() {
    const sel = document.getElementById("geminiModelSelect");
    if (!sel || sel.dataset.orPop) return false;
    if (!sel.options.length) return false;   // 아직 기본 모델 미주입 → 대기
    sel.dataset.orPop = "1";
    let ids = [];
    try {
      const r = await fetch("https://openrouter.ai/api/v1/models");
      if (r.ok) {
        const j = await r.json();
        ids = (j.data || [])
          .filter(m => m.pricing && parseFloat(m.pricing.prompt) === 0 && parseFloat(m.pricing.completion) === 0)
          .map(m => m.id)
          .filter(id => /instruct|chat|deepseek|llama|gemini|qwen|mistral|gemma|gpt|openai/i.test(id));
        // 선호 모델 우선 정렬 (ChatGPT 계열·고품질 우선)
        const pref = ["gpt", "openai", "deepseek", "llama-3.3", "gemini-2", "qwen", "mistral"];
        ids.sort((a, b) => pref.findIndex(p => a.includes(p)) - pref.findIndex(p => b.includes(p)));
        ids = [...new Set(ids)].slice(0, 12);
      }
    } catch (e) { /* CORS/네트워크 → 폴백 */ }
    if (!ids.length) ids = this.HARDCODED_FREE;
    this._freeIds = ids;
    const og = document.createElement("optgroup");
    og.label = "OpenRouter 무료 (키 필요)";
    ids.forEach(id => {
      const o = document.createElement("option");
      o.value = "openrouter:" + id;
      o.textContent = "OR · " + id.replace(":free", "").replace(/^.*\//, "");
      og.appendChild(o);
    });
    sel.appendChild(og);
    return true;
  },
};

/* 셀렉트가 채워질 때까지 기다렸다가 1회 주입 */
(function orInit() {
  let tries = 0;
  const t = setInterval(async () => {
    tries++;
    const ok = await window.OpenRouterClient._populate();
    if (ok || tries > 30) clearInterval(t);
  }, 250);
})();
