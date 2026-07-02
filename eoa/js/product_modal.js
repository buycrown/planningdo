/* =========================================================
   product_modal.js — '기획전 대상 상품' 전체 보기 팝업 + 엑셀 다운로드
   - 상세 팝업에서 호출. products/{기획전번호}.json 을 불러와 전체 상품을 표로 표시
   - 컬럼: 상품코드 · 상품명 · 브랜드 · 최초판매가 · 판매가
   - 엑셀(.xlsx) 다운로드 (SheetJS, CDN 동적 로드 / 실패 시 CSV 폴백)
   - index.html 비침투(모달 자체 주입)
   ========================================================= */
window.ProductModal = {
  XLSX_CDN: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  cur: null,        // {plan, name, count, rows}
  filtered: null,

  injectModal() {
    if (document.getElementById("prodModal")) return;
    const d = document.createElement("div");
    d.id = "prodModal";
    d.style.cssText = "position:fixed;inset:0;background:rgba(6,9,15,.85);z-index:10002;display:none;align-items:center;justify-content:center;padding:24px";
    d.innerHTML =
      '<div style="background:var(--bg,#0f1623);border:1px solid var(--line2);border-radius:14px;max-width:900px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.55)">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--line2);flex-wrap:wrap">' +
          '<b style="font-size:14px;color:var(--ink)">🛍️ 기획전 대상 상품</b>' +
          '<span id="pmInfo" style="font-size:11.5px;color:var(--muted)"></span>' +
          '<div style="margin-left:auto;display:flex;gap:7px">' +
            '<button class="btn sm" onclick="ProductModal.downloadExcel()">⬇️ 엑셀 다운로드</button>' +
            '<button class="btn sec sm" onclick="ProductModal.close()">✕ 닫기</button>' +
          '</div>' +
        '</div>' +
        '<div style="padding:10px 16px 0">' +
          '<input id="pmSearch" type="text" placeholder="상품코드·상품명·브랜드 검색" oninput="ProductModal.filter(this.value)" ' +
            'style="width:100%;padding:7px 10px;border:1.5px solid var(--line2);border-radius:8px;font-size:12px;background:var(--card);color:var(--ink)">' +
        '</div>' +
        '<div id="pmBody" style="padding:10px 16px 16px;overflow:auto"></div>' +
      '</div>';
    d.addEventListener("click", e => { if (e.target === d) ProductModal.close(); });
    document.body.appendChild(d);
  },

  async open(planId) {
    this.injectModal();
    const modal = document.getElementById("prodModal");
    modal.style.display = "flex";
    const body = document.getElementById("pmBody");
    body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--sub);font-size:12px">상품 목록 불러오는 중…</div>';
    document.getElementById("pmSearch").value = "";
    try {
      const r = await fetch("products/" + encodeURIComponent(planId) + ".json?_" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw new Error("상품 파일 없음 (HTTP " + r.status + ")");
      this.cur = await r.json();
      this.filtered = this.cur.rows;
      document.getElementById("pmInfo").textContent = "#" + this.cur.plan + " · 총 " + this.cur.count.toLocaleString() + "개";
      this.renderTable();
    } catch (e) {
      body.innerHTML = '<div style="color:var(--bad);padding:20px;font-size:12px">불러오기 실패: ' + this._esc(e.message) + '</div>';
    }
  },

  filter(q) {
    if (!this.cur) return;
    q = (q || "").trim().toLowerCase();
    this.filtered = !q ? this.cur.rows : this.cur.rows.filter(r =>
      (r.code || "").toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q) || (r.brand || "").toLowerCase().includes(q));
    this.renderTable();
  },

  renderTable() {
    const rows = this.filtered || [];
    const won = n => (n || 0).toLocaleString();
    const cap = 1500;  // 화면 렌더 상한(다운로드는 전체)
    const shown = rows.slice(0, cap);
    const th = 'style="position:sticky;top:0;background:var(--card);text-align:left;padding:7px 8px;font-size:11px;color:var(--sub);border-bottom:1px solid var(--line2);z-index:1"';
    const td = 'style="padding:6px 8px;font-size:11.5px;border-bottom:1px solid var(--line2)"';
    const tdR = 'style="padding:6px 8px;font-size:11.5px;border-bottom:1px solid var(--line2);text-align:right;white-space:nowrap"';
    document.getElementById("pmBody").innerHTML =
      '<div style="font-size:11px;color:var(--muted);margin-bottom:6px">표시 ' + shown.length.toLocaleString() + ' / ' + rows.length.toLocaleString() + '건' +
        (rows.length > cap ? ' (화면은 상위 ' + cap.toLocaleString() + '건, <b>엑셀 다운로드는 전체</b>)' : '') + '</div>' +
      '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr>' +
          '<th ' + th + '>상품코드</th><th ' + th + '>상품명</th><th ' + th + '>브랜드</th>' +
          '<th ' + th + ';text-align:right>최초판매가</th><th ' + th + ';text-align:right>판매가</th>' +
        '</tr></thead><tbody>' +
        shown.map(r =>
          '<tr><td ' + td + ';font-family:monospace;color:var(--sub)>' + this._esc(r.code) + '</td>' +
          '<td ' + td + '>' + this._esc(r.name) + '</td>' +
          '<td ' + td + '>' + this._esc(r.brand) + '</td>' +
          '<td ' + tdR + '>' + won(r.list) + '</td>' +
          '<td ' + tdR + ';color:var(--accent);font-weight:700>' + won(r.price) + '</td></tr>').join("") +
        '</tbody></table>';
  },

  _loadXLSX() {
    return new Promise((res, rej) => {
      if (window.XLSX) return res();
      const s = document.createElement("script");
      s.src = this.XLSX_CDN; s.onload = () => res(); s.onerror = () => rej(new Error("SheetJS 로드 실패"));
      document.head.appendChild(s);
    });
  },

  async downloadExcel() {
    if (!this.cur || !this.cur.rows.length) { if (typeof toast === "function") toast("다운로드할 상품이 없습니다."); return; }
    const data = this.cur.rows.map(r => ({ "상품코드": r.code, "상품명": r.name, "브랜드": r.brand, "최초판매가": r.list, "판매가": r.price }));
    const fname = "기획전_" + this.cur.plan + "_대상상품";
    try {
      await this._loadXLSX();
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [{ wch: 14 }, { wch: 50 }, { wch: 18 }, { wch: 12 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "대상상품");
      XLSX.writeFile(wb, fname + ".xlsx");
      if (typeof toast === "function") toast("엑셀(.xlsx) 다운로드 완료 — " + data.length.toLocaleString() + "건");
    } catch (e) {
      // CSV 폴백 (UTF-8 BOM → Excel 한글 정상)
      const header = "상품코드,상품명,브랜드,최초판매가,판매가\n";
      const csv = "﻿" + header + this.cur.rows.map(r =>
        [r.code, '"' + String(r.name || "").replace(/"/g, '""') + '"', '"' + String(r.brand || "").replace(/"/g, '""') + '"', r.list, r.price].join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = fname + ".csv"; a.click();
      if (typeof toast === "function") toast("CSV로 다운로드(엑셀에서 열림) — " + this.cur.rows.length.toLocaleString() + "건");
    }
  },

  close() { const m = document.getElementById("prodModal"); if (m) m.style.display = "none"; },
  _esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); },
};
