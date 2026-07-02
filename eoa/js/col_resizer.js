/* =========================================================
   col_resizer.js — 3분할 레이아웃 폭 사용자 조절(드래그 리사이저)
   - 속성검색(좌) | [핸들] | 조회 결과(중앙·남는 폭 자동) | [핸들] | AI PLAN(우)
   - 좌/우 핸들을 드래그해 폭 조절. 더블클릭 시 기본값 복귀. localStorage 저장.
   - index.html 비침투(핸들 DOM 자체 주입). 좁은 화면(≤1080)에서는 자동 비활성(세로 스택).
   ========================================================= */
(function () {
  var HANDLE = 10, MIN_SIDE = 280, MAX_SIDE = 760, MIN_CENTER = 460, KEY = "lfmall_colw_v1";
  var wrap, left, main, right, h1, h2, state = load();

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  function mkHandle(which) {
    var d = document.createElement("div");
    d.className = "colHandle"; d.dataset.which = which;
    d.title = "드래그하여 폭 조절 · 더블클릭 시 기본값";
    d.style.cssText = "width:" + HANDLE + "px;align-self:stretch;cursor:col-resize;position:relative;flex:none;z-index:5";
    d.innerHTML = "<span style='position:absolute;top:0;bottom:0;left:50%;width:2px;transform:translateX(-50%);background:var(--line2);border-radius:2px;transition:.15s'></span>";
    d.addEventListener("mouseenter", function () { d.firstChild.style.background = "var(--accent)"; d.firstChild.style.width = "3px"; });
    d.addEventListener("mouseleave", function () { if (!drag) { d.firstChild.style.background = "var(--line2)"; d.firstChild.style.width = "2px"; } });
    d.addEventListener("mousedown", onDown);
    d.addEventListener("dblclick", function () { delete state.left; delete state.right; save(); apply(); });
    return d;
  }

  function defaults() {
    var avail = wrap.clientWidth - HANDLE * 2;
    var side = Math.max(MIN_SIDE, Math.round((avail - 880) / 2));   // 중앙 ~880 기준 좌우 균등
    return { left: side, right: side };
  }
  function clamp() {
    var d = defaults();
    var L = state.left || d.left, R = state.right || d.right;
    var avail = wrap.clientWidth - HANDLE * 2;
    L = Math.max(MIN_SIDE, Math.min(MAX_SIDE, L));
    R = Math.max(MIN_SIDE, Math.min(MAX_SIDE, R));
    if (avail - L - R < MIN_CENTER) {                                // 중앙 최소폭 보장
      var over = MIN_CENTER - (avail - L - R);
      // 드래그 중인 쪽을 우선 줄임
      if (drag && drag.which === "right") R = Math.max(MIN_SIDE, R - over);
      else L = Math.max(MIN_SIDE, L - over);
    }
    return { left: Math.round(L), right: Math.round(R) };
  }

  function narrow() { return window.innerWidth <= 1080; }

  function apply() {
    if (!wrap) return;
    if (narrow()) {                          // 좁은 화면: CSS 세로 스택에 맡김
      wrap.style.gridTemplateColumns = "";
      wrap.style.gap = "";
      h1.style.display = h2.style.display = "none";
      return;
    }
    h1.style.display = h2.style.display = "block";
    var c = clamp();
    wrap.style.gap = "0";
    wrap.style.gridTemplateColumns = c.left + "px " + HANDLE + "px minmax(0,1fr) " + HANDLE + "px " + c.right + "px";
  }

  var drag = null;
  function onDown(e) {
    drag = { which: e.currentTarget.dataset.which, x: e.clientX, left: 0, right: 0 };
    var c = clamp(); drag.left = c.left; drag.right = c.right;
    document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
    e.preventDefault();
  }
  document.addEventListener("mousemove", function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x;
    if (drag.which === "left") state.left = drag.left + dx;          // 좌 핸들: 왼쪽 패널 폭
    else state.right = drag.right - dx;                              // 우 핸들: 오른쪽 패널 폭(왼쪽으로 끌면 넓어짐)
    apply();
  });
  document.addEventListener("mouseup", function () {
    if (!drag) return;
    var c = clamp(); state.left = c.left; state.right = c.right; save();
    document.body.style.cursor = ""; document.body.style.userSelect = "";
    drag = null;
  });
  window.addEventListener("resize", function () { if (!state.left && !state.right) {} apply(); });

  function init() {
    wrap = document.querySelector(".wrap"); if (!wrap) return;
    var asides = wrap.querySelectorAll(":scope > aside.panel, :scope > main");
    left = wrap.querySelector(":scope > aside.panel:first-child");
    main = wrap.querySelector(":scope > main");
    right = wrap.querySelector(":scope > aside.col-right");
    if (!left || !main || !right) return;
    h1 = mkHandle("left"); h2 = mkHandle("right");
    wrap.insertBefore(h1, main);
    wrap.insertBefore(h2, right);
    apply();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
