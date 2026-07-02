/* =========================================================
   modal_drag.js — 모달 팝업 드래그 이동 (헤더 영역 잡고 이동)
   - 모든 모달의 콘텐츠 박스를 헤더(상단 영역)로 드래그해 위치 이동
   - 백그라운드 정보를 보기 위해 팝업을 옆으로 치울 수 있음
   - 열 때마다 위치/transform 초기화. index.html 비침투.
   ========================================================= */
(function () {
  // 각 오버레이의 '콘텐츠 박스(패널)' 선택자
  var PANEL_SEL = "#previewModal .modal-content, #ontoModal > div, #aiPlanModal > div, #prodModal > div, #planDetailModal > div";
  var OVERLAYS = ["previewModal", "ontoModal", "aiPlanModal", "prodModal", "planDetailModal"];
  var HEADER_PX = 66;          // 패널 상단에서 드래그 가능한 헤더 높이
  var INTERACT = "button,input,select,textarea,a,label,svg,path";
  var drag = null;

  function panelOf(t) { return t && t.closest ? t.closest(PANEL_SEL) : null; }

  document.addEventListener("mousedown", function (e) {
    var panel = panelOf(e.target);
    if (!panel) return;
    var r = panel.getBoundingClientRect();
    if (e.clientY - r.top > HEADER_PX) return;            // 헤더 영역만
    if (e.target.closest(INTERACT)) return;               // 닫기/탭/입력 등은 제외
    var m = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(panel.style.transform || "");
    drag = { panel: panel, sx: e.clientX, sy: e.clientY, ox: m ? parseFloat(m[1]) : 0, oy: m ? parseFloat(m[2]) : 0 };
    panel.style.transition = "none"; panel.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", function (e) {
    if (!drag) return;
    var dx = drag.ox + (e.clientX - drag.sx), dy = drag.oy + (e.clientY - drag.sy);
    drag.panel.style.transform = "translate(" + dx + "px," + dy + "px)";
  });

  document.addEventListener("mouseup", function () {
    if (!drag) return;
    drag.panel.style.cursor = ""; document.body.style.userSelect = "";
    drag = null;
  });

  // 모달이 다시 열리면 위치(transform) 초기화 + 헤더 커서 힌트
  function resetPanel(overlay) {
    var panel = overlay.querySelector(":scope > div") || overlay.querySelector(".modal-content");
    if (!panel) return;
    panel.style.transform = "";
    var head = panel.firstElementChild;
    if (head && head.tagName === "DIV") head.style.cursor = "move";
  }
  function visible(el) {
    var cs = getComputedStyle(el);
    return cs.display !== "none" && (el.classList.contains("show") || cs.display === "flex" || cs.display === "block");
  }
  // 지연 생성 모달까지 포착: body 전역에서 오버레이의 표시 전환을 감지
  var vis = {};
  function init() {
    OVERLAYS.forEach(function (id) { var el = document.getElementById(id); vis[id] = el ? visible(el) : false; });
    new MutationObserver(function (muts) {
      muts.forEach(function (mu) {
        var el = mu.target;
        if (!el.id || OVERLAYS.indexOf(el.id) < 0) return;
        var now = visible(el);
        if (now && !vis[el.id]) resetPanel(el);   // 닫힘→열림 순간 초기화
        vis[el.id] = now;
      });
    }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["style", "class"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
