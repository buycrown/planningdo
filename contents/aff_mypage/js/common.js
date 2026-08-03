/**
 * common.js
 * 전 화면 공통 : 상태바/앱바/탭바 렌더링, 아이콘 주입, 모달·토스트, 숫자 포맷.
 */
(function (global) {
  'use strict';

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ------------------------------------------------------------------
     1. 포맷터
     ------------------------------------------------------------------ */
  function comma(n) { return Number(n || 0).toLocaleString('ko-KR'); }

  /** 48200 -> 4.8만 */
  function shortCount(n) {
    n = Number(n || 0);
    if (n >= 10000) return (Math.round(n / 1000) / 10).toFixed(1).replace(/\.0$/, '') + '만';
    if (n >= 1000)  return (Math.round(n / 100) / 10).toFixed(1).replace(/\.0$/, '') + '천';
    return comma(n);
  }

  /* ------------------------------------------------------------------
     2. 아이콘 주입 : <i data-icon="affiliate"></i>
     ------------------------------------------------------------------ */
  function paintIcons(ctx) {
    $$('[data-icon]', ctx).forEach(function (el) {
      if (el.dataset.painted) return;
      el.innerHTML = global.LFIcons.get(el.dataset.icon);
      el.dataset.painted = '1';
    });
  }

  /* ------------------------------------------------------------------
     3. 상태바 / 앱바 / 탭바
     ------------------------------------------------------------------ */
  function statusBarHTML() {
    return '' +
      '<div class="statusbar">' +
        '<span>9:41</span>' +
        '<span class="sb-right">' +
          '<svg width="17" height="11" viewBox="0 0 17 11"><g fill="currentColor">' +
            '<rect x="0" y="7.5" width="3" height="3.5" rx="1"/>' +
            '<rect x="4.6" y="5.4" width="3" height="5.6" rx="1"/>' +
            '<rect x="9.2" y="2.8" width="3" height="8.2" rx="1"/>' +
            '<rect x="13.8" y="0" width="3" height="11" rx="1"/>' +
          '</g></svg>' +
          '<svg width="16" height="11" viewBox="0 0 16 11"><path fill="currentColor" d="M8 10.6 5.6 8.2a3.4 3.4 0 0 1 4.8 0zM3.4 6a6.6 6.6 0 0 1 9.2 0l1.4-1.4a8.6 8.6 0 0 0-12 0zm-2-2A9.4 9.4 0 0 1 14.6 4L16 2.6a11.4 11.4 0 0 0-16 0z"/></svg>' +
          '<svg width="25" height="12" viewBox="0 0 25 12">' +
            '<rect x="0.5" y="0.5" width="21" height="11" rx="3" fill="none" stroke="currentColor" stroke-opacity=".4"/>' +
            '<rect x="2" y="2" width="17" height="8" rx="1.6" fill="currentColor"/>' +
            '<path d="M23 4.2v3.6a2 2 0 0 0 0-3.6z" fill="currentColor" fill-opacity=".4"/>' +
          '</svg>' +
        '</span>' +
      '</div>';
  }

  /**
   * 앱바 렌더
   * @param {Object} opt {title, back, home, right}
   *   back  : 뒤로가기 링크 URL (없으면 history.back)
   *   right : 'shop' | 'none'
   */
  function appBarHTML(opt) {
    opt = opt || {};
    var right = '';
    if (opt.right === 'shop') {
      right = '' +
        '<div class="appbar__right">' +
          '<a class="appbar__btn" href="#" aria-label="검색"><i data-icon="search"></i></a>' +
          '<a class="appbar__btn cart-badge" href="#" aria-label="장바구니"><i data-icon="cart"></i><em>10</em></a>' +
        '</div>';
    }
    return '' +
      '<div class="appbar' + (opt.line ? ' appbar--line' : '') + '">' +
        '<a class="appbar__btn js-back" href="' + (opt.back || '#') + '" aria-label="뒤로가기"><i data-icon="back"></i></a>' +
        '<h1 class="appbar__title">' + (opt.title || '') + '</h1>' +
        right +
      '</div>';
  }

  function tabBarHTML(active) {
    var items = [
      { key: 'category', icon: 'tabCategory', label: '카테고리' },
      { key: 'brand',    icon: 'tabBrand',    label: '브랜드' },
      { key: 'home',     icon: 'tabHome',     label: '홈' },
      { key: 'wish',     icon: 'tabWish',     label: '위시리스트' },
      { key: 'my',       icon: 'tabMy',       label: '마이페이지' }
    ];
    return '<nav class="tabbar">' + items.map(function (it) {
      return '<a href="#" class="' + (it.key === active ? 'is-on' : '') + '">' +
             '<i data-icon="' + it.icon + '"></i><span>' + it.label + '</span></a>';
    }).join('') + '</nav>';
  }

  /* ------------------------------------------------------------------
     4. 화면 뼈대 조립
     ------------------------------------------------------------------ */
  /**
   * @param {Object} opt {title, back, right, tab, caption}
   * @param {String} bodyHTML .scroll 안에 들어갈 마크업
   * @param {String} footHTML .scroll 아래 고정 영역 (선택)
   */
  function mountScreen(opt, bodyHTML, footHTML) {
    opt = opt || {};
    var screen = $('#screen');
    screen.innerHTML =
      statusBarHTML() +
      appBarHTML(opt) +
      '<div class="scroll" id="scroll">' + bodyHTML + '</div>' +
      (footHTML || '') +
      (opt.tab ? tabBarHTML(opt.tab) : '') +
      '<div class="toast" id="toast"></div>';

    paintIcons(screen);

    /* 뒤로가기 */
    var back = $('.js-back', screen);
    if (back && back.getAttribute('href') === '#') {
      back.addEventListener('click', function (e) { e.preventDefault(); history.back(); });
    }

    /* 미구현(시연 범위 외) 링크 안내 */
    $$('a[href="#"]', screen).forEach(function (a) {
      if (a.classList.contains('js-back')) return;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        toast('시연 범위 외 화면입니다.');
      });
    });
  }

  /* ------------------------------------------------------------------
     5. 토스트
     ------------------------------------------------------------------ */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 1800);
  }

  /* ------------------------------------------------------------------
     6. 확인 모달
     ------------------------------------------------------------------ */
  /**
   * @param {Object} opt {title, desc, cancel, confirm, danger}
   * @returns {Promise<boolean>}
   */
  function confirmModal(opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.className = 'modal is-open';
      wrap.innerHTML =
        '<div class="modal__box">' +
          '<div class="modal__body">' +
            '<p class="modal__title">' + (opt.title || '') + '</p>' +
            '<p class="modal__desc">' + (opt.desc || '') + '</p>' +
          '</div>' +
          '<div class="modal__foot">' +
            '<button type="button" class="js-cancel">' + (opt.cancel || '취소') + '</button>' +
            '<button type="button" class="is-primary js-ok">' + (opt.confirm || '확인') + '</button>' +
          '</div>' +
        '</div>';
      $('#screen').appendChild(wrap);

      function close(v) { wrap.remove(); resolve(v); }
      $('.js-cancel', wrap).addEventListener('click', function () { close(false); });
      $('.js-ok', wrap).addEventListener('click', function () { close(true); });
      wrap.addEventListener('click', function (e) { if (e.target === wrap) close(false); });
    });
  }

  /* ------------------------------------------------------------------
     7. 시연 도구 (프레임 밖 하단)
     ------------------------------------------------------------------ */
  function mountDemoTools() {
    var host = $('#demoTools');
    if (!host) return;
    host.innerHTML =
      '<button type="button" id="btnResetDemo">시연 상태 초기화</button>' +
      '<button type="button" id="btnGoMypage">마이페이지로</button>';
    $('#btnResetDemo').addEventListener('click', function () {
      global.AffiliateStore.reset();
      location.reload();
    });
    $('#btnGoMypage').addEventListener('click', function () {
      location.href = 'index.html';
    });
  }

  global.LF = {
    $: $, $$: $$,
    comma: comma,
    shortCount: shortCount,
    paintIcons: paintIcons,
    mountScreen: mountScreen,
    mountDemoTools: mountDemoTools,
    toast: toast,
    confirmModal: confirmModal
  };
})(window);
