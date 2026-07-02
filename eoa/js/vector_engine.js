/* =========================================================
   vector_engine.js — 하이브리드 유사도 엔진 (v4)
   - 로컬 계층: vectors_local.json (TF-IDF 희소벡터) 코사인 유사도
   - 의미 계층: Gemini 임베딩 코사인 (브라우저에서 호출·캐시; 옵션)
   - 결합: hybridSim = α·코사인(로컬) + β·온톨로지유사도(기존 similarity)
   ========================================================= */
window.VectorEngine = {
  local: null,          // { N, DF, vectors:{id:{term:weight}} }
  embCache: {},         // { id: [dense vector] }  (Gemini 임베딩 캐시)
  alpha: 0.55,          // 로컬 TF-IDF 코사인 가중
  beta: 0.45,           // 온톨로지(키워드 자카드+범위) 가중

  async load() {
    if (this.local) return this.local;
    try {
      const r = await fetch("vectors_local.json?_" + Date.now(), { cache: "no-store" });
      this.local = await r.json();
    } catch (e) {
      console.warn("[VectorEngine] vectors_local.json 로드 실패 — 온톨로지 유사도로 폴백", e);
      this.local = { N: 0, DF: {}, vectors: {} };
    }
    return this.local;
  },

  cosineSparse(a, b) {
    if (!a || !b) return 0;
    let dot = 0;
    const small = Object.keys(a).length < Object.keys(b).length ? a : b;
    const big = small === a ? b : a;
    for (const t in small) { if (big[t]) dot += small[t] * big[t]; }
    // 로컬 벡터는 빌드시 정규화됨(단위벡터) → dot이 곧 코사인
    return Math.max(0, Math.min(1, dot));
  },

  /* 로컬 TF-IDF 코사인 (id 기반) */
  localSim(idA, idB) {
    if (!this.local || !this.local.vectors) return 0;
    return this.cosineSparse(this.local.vectors[idA], this.local.vectors[idB]);
  },

  /* 하이브리드: 두 EVENT 객체 a,b */
  hybrid(a, b) {
    const lc = this.localSim(a.id, b.id);
    let onto = 0;
    try { onto = (typeof similarity === "function") ? similarity(a, b) : 0; } catch (e) {}
    if (!this.local || this.local.N === 0) return onto;     // 로컬 없으면 온톨로지만
    return this.alpha * lc + this.beta * onto;
  },

  /* 기준 이벤트에 대한 상위 유사 이벤트 */
  topSimilar(base, pool, n) {
    const list = pool.filter(e => e.id !== base.id)
      .map(e => ({ e, s: this.hybrid(base, e) }))
      .sort((x, y) => y.s - x.s);
    return (n ? list.slice(0, n) : list);
  },

  /* ---- Gemini 임베딩(의미 계층) : 브라우저 호출·캐시 (옵션, 필요시 사용) ---- */
  async embed(id, text) {
    if (this.embCache[id]) return this.embCache[id];
    const key = (window.CONFIG || {}).gemini_api_key;
    if (!key) return null;
    const url = "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=" + encodeURIComponent(key);
    try {
      const r = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { parts: [{ text: text }] } }),
      });
      if (!r.ok) return null;
      const j = await r.json();
      const v = j.embedding && j.embedding.values;
      if (v) this.embCache[id] = v;
      return v || null;
    } catch (e) { return null; }
  },

  cosineDense(a, b) {
    if (!a || !b) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  },
};

/* 시작 시 로컬 벡터 자동 로드 (하이브리드 유사도 활성화) */
window.VectorEngine.load();
