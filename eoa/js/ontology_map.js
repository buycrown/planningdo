/* =========================================================
   ontology_map.js — 온톨로지 맵 (기능 2)  [Cytoscape.js]
   - 솔트룩스 '구버/커넥텀' 참고: 주어(PLAN)+관계+목적어(속성/브랜드/카테고리) 트리플 그래프
   - 조회 결과 기획전들 간의 관계를 노드-링크로 시각화
   - 매일 10시 갱신 시 MD 설명서 생성(exportMarkdown)
   - index.html 비침투: 버튼/모달을 JS로 주입, Cytoscape는 CDN 동적 로드
   ========================================================= */
window.OntologyMap = {
  cy: null,
  CDN: "https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.2/cytoscape.min.js",
  MAX_PLANS: 36,          // 가독성 상한
  TOP_ATTR_PER_AXIS: 6,
  SIM_THRESHOLD: 0.45,    // similar_to 엣지 임계
  showAttrEdges: true,    // 속성-속성 연관 엣지 표시
  axisColor: { placement: "#fb7185", theme: "#a78bfa", benefit: "#fcd34d", product: "#86efac", brand: "#93c5fd", card: "#fdba74", metric: "#f9a8d4" },
  AX: ["placement", "theme", "benefit", "product", "brand", "card", "metric"],
  lastGraph: null,

  init() {
    this.injectButton();
    this.injectModal();
  },

  injectButton() {
    if (document.getElementById("ontoMapBtn")) return;
    const bar = document.querySelector(".toolbar");
    if (!bar) return;
    const btn = document.createElement("button");
    btn.id = "ontoMapBtn";
    btn.className = "btn sec sm";
    btn.style.marginLeft = "8px";
    btn.innerHTML = "🕸️ 온톨로지 맵";
    btn.onclick = () => this.open();
    bar.appendChild(btn);
  },

  injectModal() {
    if (document.getElementById("ontoModal")) return;
    const d = document.createElement("div");
    d.id = "ontoModal";
    d.style.cssText = "position:fixed;inset:0;background:#070b12;z-index:9999;display:none;flex-direction:column;padding:18px";
    d.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;color:var(--ink)">' +
        '<b style="font-size:16px">🕸️ 온톨로지 맵 <span style="font-size:11px;color:var(--sub)">커넥텀 스타일 · 트리플 그래프</span></b>' +
        '<span id="ontoStat" style="font-size:11.5px;color:var(--muted)"></span>' +
        '<div style="margin-left:auto;display:flex;gap:7px;align-items:center">' +
          '<label style="font-size:11px;color:var(--sub);display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" id="attrEdgeToggle" checked onchange="OntologyMap.toggleAttrEdges(this.checked)">속성연관 엣지</label>' +
          '<button class="btn sec sm" onclick="OntologyMap.relayout()">재배치</button>' +
          '<button class="btn sec sm" onclick="OntologyMap.exportMarkdown(true)">📄 설명서 MD</button>' +
          '<button class="btn sec sm" onclick="OntologyMap.close()">✕ 닫기</button>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;font-size:10.5px;color:var(--sub)">' +
        '<span>●기획전(PLAN)</span>' +
        '<span style="color:#fb7185">●노출구좌</span><span style="color:#a78bfa">●테마</span><span style="color:#fcd34d">●혜택</span>' +
        '<span style="color:#86efac">●상품</span><span style="color:#93c5fd">●브랜드</span><span style="color:#f9a8d4">●성과</span>' +
        '<span style="color:#64748b">— has_attribute · ┄ 속성연관 · — 유사</span>' +
        '<span style="color:#fff">◯ 흰테=선택 중심속성</span>' +
      '</div>' +
      '<div id="cyHost" style="flex:1;background:#0b0f17;border:1px solid var(--line2);border-radius:12px;min-height:300px"></div>' +
      '<div id="ontoTip" style="font-size:11px;color:var(--muted);margin-top:6px">노드를 클릭하면 연결 관계가 강조됩니다.</div>';
    document.body.appendChild(d);
  },

  _loadCyto() {
    return new Promise((resolve, reject) => {
      if (window.cytoscape) return resolve();
      const s = document.createElement("script");
      s.src = this.CDN; s.onload = () => resolve(); s.onerror = () => reject(new Error("Cytoscape 로드 실패"));
      document.head.appendChild(s);
    });
  },

  _visibleEvents() {
    let list = [];
    try { list = (typeof getCurrentVisibleEvents === "function") ? getCurrentVisibleEvents() : (window.EVENTS || []); }
    catch (e) { list = window.EVENTS || []; }
    return list.slice(0, this.MAX_PLANS);
  },

  /* 트리플 그래프 구성 (PLAN-속성 + 속성-속성 연관 + PLAN-PLAN 유사) */
  buildElements(evs) {
    const nodes = {}, edges = [];
    const selected = (window.AttrSources && AttrSources.selected) || [];
    const centralIds = new Set(selected.map(s => s.axis[0] + "_" + s.value));
    const addNode = (id, label, type, axis) => {
      if (!nodes[id]) nodes[id] = { data: { id, label, type, axis: axis || "", deg: 1 } };
      else nodes[id].data.deg = (nodes[id].data.deg || 1) + 1;
    };
    const planAttrs = [];
    evs.forEach(e => {
      const pid = "P_" + e.id;
      addNode(pid, e.name.length > 18 ? e.name.slice(0, 18) + "…" : e.name, "plan");
      nodes[pid].data.sales = e.sales || 0;
      nodes[pid].data.url = e.url;
      const aids = [];
      this.AX.forEach(axis => {
        (e.kw[axis] || []).slice(0, 3).forEach(v => {
          const aid = axis[0] + "_" + v;
          addNode(aid, v, "attr", axis);
          if (centralIds.has(aid)) nodes[aid].data.central = 1;
          edges.push({ data: { id: pid + "~" + aid, source: pid, target: aid, rel: "has_attribute" } });
          aids.push(aid);
        });
      });
      planAttrs.push([...new Set(aids)]);
    });

    // 속성-속성 연관 엣지 (교차 축 동시출현 → 지식그래프)
    let attrEdgeCount = 0;
    if (this.showAttrEdges) {
      const co = {};
      planAttrs.forEach(aids => {
        for (let i = 0; i < aids.length; i++) for (let j = i + 1; j < aids.length; j++) {
          const a = aids[i], b = aids[j];
          if (nodes[a].data.axis === nodes[b].data.axis) continue;   // 동일 축 제외
          const k = a < b ? a + "|" + b : b + "|" + a;
          co[k] = (co[k] || 0) + 1;
        }
      });
      const minCo = Math.max(2, Math.round(evs.length * 0.08));
      Object.entries(co).filter(e => e[1] >= minCo).sort((x, y) => y[1] - x[1]).slice(0, 70)
        .forEach(e => {
          const ab = e[0].split("|");
          edges.push({ data: { id: "R_" + e[0], source: ab[0], target: ab[1], rel: "related_to", w: e[1] } });
          attrEdgeCount++;
        });
    }

    // similar_to (PLAN-PLAN, 하이브리드 유사도)
    const VE = window.VectorEngine;
    for (let i = 0; i < evs.length; i++) {
      for (let j = i + 1; j < evs.length; j++) {
        let sim = 0;
        try { sim = VE ? VE.hybrid(evs[i], evs[j]) : (typeof similarity === "function" ? similarity(evs[i], evs[j]) : 0); } catch (e) {}
        if (sim >= this.SIM_THRESHOLD) {
          edges.push({ data: { id: "S_" + evs[i].id + "_" + evs[j].id, source: "P_" + evs[i].id, target: "P_" + evs[j].id, rel: "similar_to", w: sim } });
        }
      }
    }
    this.lastGraph = { nodes: Object.values(nodes), edges, planCount: evs.length, attrEdges: attrEdgeCount, centralCount: centralIds.size };
    return this.lastGraph.nodes.concat(edges);
  },

  async open() {
    const modal = document.getElementById("ontoModal");
    modal.style.display = "flex";
    const host = document.getElementById("cyHost");
    host.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--sub);font-size:12px">그래프 구성 중…</div>';
    try { await this._loadCyto(); } catch (e) { host.innerHTML = '<div style="color:var(--bad);padding:20px">Cytoscape 로드 실패: ' + e.message + '</div>'; return; }

    const evs = this._visibleEvents();
    if (evs.length === 0) { host.innerHTML = '<div style="padding:20px;color:var(--sub)">조회된 기획전이 없습니다. 좌측에서 조건/속성을 선택하세요.</div>'; return; }
    const els = this.buildElements(evs);
    host.innerHTML = "";

    const self = this;
    this.cy = cytoscape({
      container: host,
      elements: els,
      style: [
        { selector: 'node[type="plan"]', style: {
          "background-color": "#e25822", "label": "data(label)", "color": "#fff", "font-size": "10px",
          "width": "mapData(sales, 0, 200000, 18, 50)", "height": "mapData(sales, 0, 200000, 18, 50)",
          "text-valign": "center", "text-halign": "center", "text-wrap": "wrap", "text-max-width": "80px",
          "text-outline-color": "#0b0f17", "text-outline-width": 2.4, "min-zoomed-font-size": 6,
          "border-width": 2, "border-color": "#ff7a45" } },
        { selector: 'node[type="attr"]', style: {
          "background-color": ele => self.axisColor[ele.data("axis")] || "#888",
          "label": "data(label)", "color": "#ffffff", "font-size": "10px", "width": 13, "height": 13,
          "text-valign": "bottom", "text-margin-y": 3, "text-wrap": "wrap", "text-max-width": "90px",
          "text-outline-color": "#0b0f17", "text-outline-width": 2.4, "min-zoomed-font-size": 7 } },
        { selector: 'edge[rel="has_attribute"]', style: {
          "width": 1, "line-color": "#33405a", "curve-style": "haystack", "opacity": 0.5 } },
        { selector: 'edge[rel="similar_to"]', style: {
          "width": "mapData(w, 0.45, 1, 1, 4)", "line-color": "#8aa0c8", "opacity": 0.55, "curve-style": "bezier" } },
        { selector: 'edge[rel="related_to"]', style: {
          "width": "mapData(w, 2, 14, 1, 5)", "line-color": "#6d7fae", "line-style": "dashed", "opacity": 0.5, "curve-style": "bezier" } },
        { selector: 'node[central=1]', style: {
          "border-width": 4, "border-color": "#ffffff", "width": 26, "height": 26, "font-size": "12px",
          "font-weight": "bold", "color": "#fff", "text-valign": "bottom", "text-margin-y": 4,
          "text-outline-color": "#0b0f17", "text-outline-width": 3, "z-index": 80 } },
        { selector: ".hl", style: { "border-width": 3, "border-color": "#fff", "opacity": 1, "z-index": 99 } },
        { selector: ".dim", style: { "opacity": 0.12 } },
      ],
      layout: { name: "cose", animate: false, nodeRepulsion: 16000, idealEdgeLength: 100, nodeOverlap: 24, componentSpacing: 150, padding: 36, gravity: 0.25 },
      wheelSensitivity: 0.25,
    });

    this.cy.on("tap", "node", function (evt) {
      const n = evt.target;
      self.cy.elements().addClass("dim").removeClass("hl");
      n.closedNeighborhood().removeClass("dim").addClass("hl");
      const t = document.getElementById("ontoTip");
      if (n.data("type") === "plan" && n.data("url")) {
        t.innerHTML = '선택: <b>' + n.data("label") + '</b> · <a href="' + n.data("url") + '" target="_blank" style="color:var(--accent)">기획전 페이지 ↗</a>';
      } else {
        // 속성 노드 클릭 → 해당 속성을 가진 기획전 리스트 (manyfast plan §2.3.2 차용)
        const axis = n.data("axis"), val = n.data("label");
        const all = (window.EVENTS || []).filter(e => (e.kw[axis] || []).indexOf(val) >= 0);
        const links = all.slice(0, 10).map(e =>
          '<a href="' + e.url + '" target="_blank" rel="noopener" style="color:var(--accent);margin-right:8px;white-space:nowrap">· ' +
          (e.name.length > 18 ? e.name.slice(0, 18) + "…" : e.name) + ' ↗</a>').join(" ");
        t.innerHTML = '속성 <b>' + val + '</b> <span style="color:var(--muted)">(' + axis + ')</span> · 보유 기획전 <b>' + all.length + '</b>개<br>' +
          '<div style="margin-top:3px;line-height:1.8">' + (links || '없음') + (all.length > 10 ? ' <span style="color:var(--muted)">외 ' + (all.length - 10) + '개</span>' : '') + '</div>';
      }
    });
    // 엣지 클릭 → 관계 유형 + 가중치(0~1) 수치 노출 (manyfast plan §2 수용기준5 차용)
    this.cy.on("tap", "edge", function (evt) {
      const e = evt.target, rel = e.data("rel"), w = e.data("w");
      const relLabel = { has_attribute: "has_attribute (보유)", similar_to: "similar_to (기획전 유사)", related_to: "related_to (속성 연관)" }[rel] || rel;
      self.cy.elements().addClass("dim"); e.removeClass("dim").addClass("hl"); e.connectedNodes().removeClass("dim").addClass("hl");
      const t = document.getElementById("ontoTip");
      t.innerHTML = '관계 <b>' + relLabel + '</b>' +
        (w != null ? ' · 가중치 <b>' + (typeof w === "number" ? (rel === "related_to" ? "동시출현 " + w : w.toFixed(2)) : w) + '</b>' : ' <span style="color:var(--muted)">(가중치 없음)</span>') +
        ' &nbsp; ' + e.connectedNodes().map(x => x.data("label")).join(" ↔ ");
    });
    this.cy.on("tap", function (evt) { if (evt.target === self.cy) self.cy.elements().removeClass("dim hl"); });

    const g = this.lastGraph;
    const attrN = g.nodes.filter(n => n.data.type === "attr").length;
    const simE = g.edges.filter(e => e.data.rel === "similar_to").length;
    document.getElementById("ontoStat").textContent =
      "기획전 " + g.planCount + " · 속성 " + attrN + " · 속성연관 " + (g.attrEdges || 0) + " · 유사연결 " + simE +
      (g.centralCount ? " · 중심속성 " + g.centralCount : "") + " · 트리플 " + g.edges.length;
    // 선택 속성(중심)이 있으면 자동 포커스
    if (g.centralCount) {
      const cen = this.cy.nodes("[central=1]");
      if (cen.length) { this.cy.elements().addClass("dim"); cen.closedNeighborhood().removeClass("dim").addClass("hl"); }
    }
  },

  relayout() { if (this.cy) this.cy.layout({ name: "cose", animate: true, nodeRepulsion: 16000, idealEdgeLength: 100, nodeOverlap: 24, componentSpacing: 150, gravity: 0.25 }).run(); },
  toggleAttrEdges(v) { this.showAttrEdges = v; this.open(); },
  close() { document.getElementById("ontoModal").style.display = "none"; },

  /* 매일 10시 갱신 설명서(MD) — 현재 맵 구조를 설명 */
  exportMarkdown(download) {
    const g = this.lastGraph;
    if (!g) { if (typeof toast === "function") toast("먼저 온톨로지 맵을 열어주세요."); return ""; }
    const hubs = g.nodes.filter(n => n.data.type === "attr")
      .map(n => ({ v: n.data.label, axis: n.data.axis, deg: n.data.deg || 1 }))
      .sort((a, b) => b.deg - a.deg).slice(0, 12);
    const today = new Date().toISOString().slice(0, 10);
    const md =
      "# 온톨로지 맵 설명서 (" + today + ")\n\n" +
      "## 개요\n" +
      "- 모델: Gemini 2.5 Pro 기반 갱신 / 시각화: Cytoscape.js (커넥텀 스타일)\n" +
      "- 노드 = 주어(PLAN) + 목적어(속성·브랜드·카테고리), 엣지 = 관계(has_attribute, similar_to)\n\n" +
      "## 구성 통계\n" +
      "- 기획전 노드: " + g.planCount + "\n" +
      "- 속성 노드: " + g.nodes.filter(n => n.data.type === "attr").length + "\n" +
      "- 속성-속성 연관 엣지(related_to): " + (g.attrEdges || 0) + "\n" +
      "- 선택 중심 속성: " + (g.centralCount || 0) + "\n" +
      "- 트리플(엣지) 총: " + g.edges.length + " (similar_to " + g.edges.filter(e => e.data.rel === "similar_to").length + ")\n\n" +
      "## 핵심 허브 속성 (연결도 상위)\n" +
      hubs.map((h, i) => (i + 1) + ". **" + h.v + "** (" + h.axis + ") — 연결 " + h.deg + "개").join("\n") + "\n\n" +
      "## 구현 방식\n" +
      "1. 조회 결과 기획전을 주어 노드로 배치\n" +
      "2. 각 기획전의 5축 속성(테마·혜택·상품·비주얼·브랜드)을 목적어 노드로 연결(has_attribute)\n" +
      "3. 하이브리드 유사도(TF-IDF 코사인 + 온톨로지 자카드) ≥ " + this.SIM_THRESHOLD + " 인 기획전 쌍을 similar_to로 연결\n" +
      "4. cose 레이아웃으로 군집 자동 형성, 매출 규모를 노드 크기로 매핑\n";
    if (download) {
      const blob = new Blob([md], { type: "text/markdown" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "ontology_map_" + today + ".md"; a.click();
      if (typeof toast === "function") toast("온톨로지 맵 설명서(MD) 저장됨");
    }
    return md;
  },
};

(function waitReady() {
  if (document.querySelector(".toolbar")) OntologyMap.init();
  else setTimeout(waitReady, 200);
})();
