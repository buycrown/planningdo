/**
 * common.js  (v2.0)
 * 03_활동내역 전 화면 공통 모듈.
 *
 *  - LFAuth 설정(로그인 페이지 경로 등) 및 세션 가드
 *  - 앱바 / 본문 / 하단 CTA 뼈대 렌더  (※ iPhone 디바이스 목업·상태바·데모툴 전면 제거)
 *  - 안전한 DOM 빌더(el) : 서버 데이터는 textContent / setAttribute 로만 주입 (XSS 방지)
 *  - 로딩 스켈레톤 / 빈 상태 / 오류+재시도 공통 UI
 *  - 백그라운드 갱신 인디케이터(앱바 하단 2px 진행 바)
 *  - 토스트, 확인 모달, 폼 모달, 숫자·날짜 포맷
 *
 * ES5 호환 문법(var, 함수 선언식)만 사용합니다.
 */
(function (global) {
  'use strict';

  var doc = global.document;

  /* ------------------------------------------------------------------
     0. 공용 인증 모듈 경로
        ★ 여기서 경로를 주입하지 않는다.
          loginUrl / homeUrl / applyUrl 은 site-config.js(window.LFSite) 가
          환경(local / deploy)에 맞춰 계산해 auth.js 에 이미 들어가 있다.
          로컬 폴더 구조와 배포 경로가 달라 하드코딩하면 배포에서 404 가 된다.
     ------------------------------------------------------------------ */
  var LFSite = global.LFSite || null;

  /** 화면 키 → URL. LFSite 가 없으면 기존 상대경로로 폴백한다. */
  function siteUrl(key, fallback) {
    if (LFSite && typeof LFSite.resolve === 'function') {
      try {
        var v = LFSite.resolve(key);
        if (v) return v;
      } catch (e) { /* 폴백 */ }
    }
    return fallback;
  }

  var LOGIN_URL = siteUrl('login', '../04_로그인/login.html');
  var HOME_URL = siteUrl('my', 'affiliate.html');

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  /* ------------------------------------------------------------------
     1. 포맷터
     ------------------------------------------------------------------ */
  function comma(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return v.toLocaleString('ko-KR');
  }

  function won(n) { return comma(n) + '원'; }

  /** 'YYYY-MM-DD' -> 'YYYY.MM.DD' (형식이 다르면 원문 그대로) */
  function fmtDate(v) {
    var s = String(v == null ? '' : v).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).replace(/-/g, '.') : s;
  }

  /** 'YYYY-MM' -> '2026년 7월' */
  function fmtYm(v) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(v == null ? '' : v).trim());
    return m ? Number(m[1]) + '년 ' + Number(m[2]) + '월' : String(v == null ? '' : v);
  }

  /** 백분율(소수 1자리) */
  function ratio(part, whole) {
    if (!whole) return 0;
    return Math.round(Number(part) / Number(whole) * 1000) / 10;
  }

  /** http(s) 로 시작하는 절대 URL 만 통과. 그 외에는 빈 문자열 */
  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    return /^https?:\/\//i.test(s) ? s : '';
  }

  /** 정적 문자열 조립이 필요한 곳에서만 사용하는 HTML 이스케이프 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ------------------------------------------------------------------
     2. 안전한 DOM 빌더
        props : { className, text, html(정적 마크업 전용), attrs, on }
     ------------------------------------------------------------------ */
  function el(tag, props, kids) {
    var node = doc.createElement(tag);
    if (props) {
      if (props.className) node.className = props.className;
      if (props.text !== undefined && props.text !== null) node.textContent = String(props.text);
      if (props.html !== undefined && props.html !== null) node.innerHTML = props.html;
      if (props.attrs) {
        Object.keys(props.attrs).forEach(function (k) {
          var v = props.attrs[k];
          if (v === false || v === null || v === undefined) return;
          node.setAttribute(k, v === true ? '' : String(v));
        });
      }
      if (props.on) {
        Object.keys(props.on).forEach(function (k) { node.addEventListener(k, props.on[k]); });
      }
    }
    appendKids(node, kids);
    return node;
  }

  function appendKids(node, kids) {
    if (kids === undefined || kids === null) return node;
    var list = Object.prototype.toString.call(kids) === '[object Array]' ? kids : [kids];
    list.forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    });
    return node;
  }

  function frag(kids) { return appendKids(doc.createDocumentFragment(), kids); }

  /** <i data-icon="name"> 노드 생성 */
  function iconEl(name, className) {
    var i = doc.createElement('i');
    if (className) i.className = className;
    i.setAttribute('data-icon', name);
    return i;
  }

  function clear(node) {
    if (!node) return node;
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  /** 문자열(정적) 또는 Node 를 컨테이너에 채운다 */
  function fill(node, content) {
    clear(node);
    if (content === null || content === undefined) return node;
    if (typeof content === 'string') node.innerHTML = content;
    else appendKids(node, content);
    paintIcons(node);
    return node;
  }

  /* ------------------------------------------------------------------
     3. 아이콘 주입 : <i data-icon="affiliate"></i>
     ------------------------------------------------------------------ */
  function paintIcons(ctx) {
    if (!global.LFIcons) return;
    var root = ctx || doc;
    var list = $$('[data-icon]', root);
    if (root.nodeType === 1 && root.hasAttribute && root.hasAttribute('data-icon')) list.unshift(root);
    list.forEach(function (node) {
      if (node.getAttribute('data-painted') === '1') return;
      node.innerHTML = global.LFIcons.get(node.getAttribute('data-icon'));
      node.setAttribute('data-painted', '1');
      if (!node.getAttribute('aria-hidden')) node.setAttribute('aria-hidden', 'true');
    });
  }

  /* ------------------------------------------------------------------
     4. 앱바 / 화면 뼈대
        opt : { title, back, logout }
          back   : 뒤로가기 링크 URL (미지정 시 history.back)
          logout : true 이면 뒤로가기 대신 로그아웃 버튼 노출 (진입점 화면)
     ------------------------------------------------------------------ */
  function buildAppBar(opt) {
    var bar = el('header', { className: 'appbar', attrs: { role: 'banner' } });

    if (!opt.logout) {
      var back = el('a', {
        className: 'appbar__btn js-back',
        attrs: { href: opt.back || '#', 'aria-label': '뒤로가기' }
      }, iconEl('back'));
      if (!opt.back) {
        back.addEventListener('click', function (e) {
          e.preventDefault();
          if (global.history.length > 1) global.history.back();
          else global.location.href = HOME_URL;
        });
      }
      bar.appendChild(back);
    }

    bar.appendChild(el('h1', {
      className: 'appbar__title' + (opt.logout ? ' appbar__title--lead' : ''),
      text: opt.title || ''
    }));

    if (opt.logout) {
      bar.appendChild(el('button', {
        className: 'appbar__logout js-logout',
        attrs: { type: 'button' }
      }, [iconEl('logout'), el('span', { text: '로그아웃' })]));
    }
    return bar;
  }

  /**
   * 화면 뼈대를 #app 안에 렌더한다.
   * @param {Object} opt      {title, back, logout}
   * @param {String|Node} body 본문 (생략 가능 — 이후 LF.setBody 로 채움)
   * @param {String|Node} foot 하단 고정 영역 (선택)
   */
  function mountScreen(opt, body, foot) {
    opt = opt || {};
    var app = $('#app');
    if (!app) return null;

    clear(app);
    app.appendChild(buildAppBar(opt));
    /*
     * 백그라운드 갱신 인디케이터.
     * 스켈레톤과 달리 콘텐츠를 가리지 않고 앱바 바로 아래에 2px 로만 표시한다.
     * 요소는 '항상' 자리를 차지하고(투명 트랙) is-on 클래스로 색만 켠다.
     * hidden 속성으로 넣었다 뺐다 하면 갱신할 때마다 콘텐츠가 2px 밀린다.
     * 순수 장식이므로 보조기술에는 항상 숨긴다.
     */
    app.appendChild(el('div', {
      className: 'refresh-bar',
      attrs: { id: 'refreshBar', 'aria-hidden': 'true' }
    }, el('span', { className: 'refresh-bar__fill' })));
    var view = el('main', { className: 'view', attrs: { id: 'view', role: 'main' } });
    app.appendChild(view);
    app.appendChild(el('div', { className: 'foot', attrs: { id: 'foot' } }));

    ensureToast();

    if (body !== undefined && body !== null) setBody(body);
    if (foot !== undefined && foot !== null) setFoot(foot);

    paintIcons(app);

    var lo = $('.js-logout', app);
    if (lo) lo.addEventListener('click', onLogoutClick);

    /* 시연 범위 외 링크 안내 */
    app.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href="#"]') : null;
      if (!a || a.classList.contains('js-back')) return;
      e.preventDefault();
      toast('시연 범위 외 화면입니다.');
    });

    return view;
  }

  function onLogoutClick() {
    confirmModal({
      title: '로그아웃',
      desc: '로그아웃 하시겠습니까?',
      cancel: '취소',
      confirm: '로그아웃'
    }).then(function (ok) {
      if (!ok) return;
      if (global.LFAuth) global.LFAuth.logout();
      else global.location.replace(LOGIN_URL);
    });
  }

  function setBody(content) { return fill($('#view'), content); }
  function setFoot(content) { return fill($('#foot'), content); }

  /** 백그라운드 갱신 진행 바 표시/숨김 (레이아웃은 움직이지 않는다 — 색만 바뀐다) */
  function setRefreshing(on) {
    var bar = $('#refreshBar');
    if (!bar) return;
    bar.classList.toggle('is-on', !!on);
  }

  /* ------------------------------------------------------------------
     5. 토스트
     ------------------------------------------------------------------ */
  var toastTimer = null;

  function ensureToast() {
    if ($('#toast')) return;
    doc.body.appendChild(el('div', {
      className: 'toast',
      attrs: { id: 'toast', role: 'status', 'aria-live': 'polite' }
    }));
  }

  function toast(msg) {
    ensureToast();
    var node = $('#toast');
    if (!node) return;
    node.textContent = String(msg == null ? '' : msg);
    node.classList.add('is-on');
    global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(function () { node.classList.remove('is-on'); }, 2000);
  }

  /* ------------------------------------------------------------------
     6. 모달
     ------------------------------------------------------------------ */
  /**
   * 임의 콘텐츠 모달.
   * @param {Node|String} boxContent .modal__box 안에 넣을 내용
   * @returns {{root:Node, close:Function}}
   */
  function openModal(boxContent) {
    var box = el('div', { className: 'modal__box', attrs: { role: 'dialog', 'aria-modal': 'true' } });
    if (typeof boxContent === 'string') box.innerHTML = boxContent;
    else appendKids(box, boxContent);

    var wrap = el('div', { className: 'modal is-open' }, box);
    doc.body.appendChild(wrap);
    paintIcons(wrap);

    function close() {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      doc.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    doc.addEventListener('keydown', onKey);

    var focusable = $('button, input, textarea, a[href]', box);
    if (focusable) focusable.focus();

    return { root: wrap, box: box, close: close };
  }

  /**
   * 확인 모달.
   * @param {Object} opt {title, desc(정적 HTML), cancel, confirm}
   * @returns {Promise<boolean>}
   */
  function confirmModal(opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      var body = el('div', { className: 'modal__body' }, [
        el('p', { className: 'modal__title', text: opt.title || '' }),
        el('p', { className: 'modal__desc', html: opt.desc || '' })
      ]);
      var btnCancel = el('button', { attrs: { type: 'button' }, text: opt.cancel || '취소' });
      var btnOk = el('button', { className: 'is-primary', attrs: { type: 'button' }, text: opt.confirm || '확인' });
      var footRow = el('div', { className: 'modal__foot' }, [btnCancel, btnOk]);

      var m = openModal([body, footRow]);
      var settled = false;
      function done(v) { if (settled) return; settled = true; m.close(); resolve(v); }

      btnCancel.addEventListener('click', function () { done(false); });
      btnOk.addEventListener('click', function () { done(true); });
      m.root.addEventListener('click', function (e) { if (e.target === m.root) done(false); });
    });
  }

  /* ------------------------------------------------------------------
     7. 상태 UI : 로딩 스켈레톤 / 빈 상태 / 오류
     ------------------------------------------------------------------ */
  var SKELETONS = {
    dashboard:
      '<div class="skel-wrap">' +
        '<div class="skel-row"><div class="skel skel-circle"></div>' +
          '<div><div class="skel skel-line is-half"></div><div class="skel skel-line is-3q"></div></div></div>' +
        '<div class="skel skel-line is-sm"></div>' +
        '<div class="skel skel-line is-lg"></div>' +
        '<div class="skel skel-box"></div>' +
        '<div class="skel skel-line is-full" style="height:48px"></div>' +
      '</div>' +
      '<div class="band"></div>' +
      '<div class="skel-wrap">' +
        '<div class="skel skel-line is-full" style="height:40px"></div>' +
        '<div class="skel skel-line is-full" style="height:40px"></div>' +
        '<div class="skel skel-line is-full" style="height:40px"></div>' +
      '</div>',
    list:
      '<div class="skel-wrap">' +
        '<div class="skel skel-line is-sm"></div>' +
        '<div class="skel skel-line is-lg"></div>' +
        '<div class="skel skel-box"></div>' +
        '<div class="skel skel-box"></div>' +
        '<div class="skel skel-box"></div>' +
      '</div>',
    detail:
      '<div class="skel-wrap">' +
        '<div class="skel-row"><div class="skel skel-circle"></div>' +
          '<div><div class="skel skel-line is-half"></div><div class="skel skel-line is-3q"></div></div></div>' +
        '<div class="skel skel-line is-full"></div>' +
        '<div class="skel skel-line is-3q"></div>' +
        '<div class="skel skel-line is-half"></div>' +
        '<div class="skel skel-box"></div>' +
      '</div>',
    text:
      '<div class="skel-wrap">' +
        '<div class="skel skel-line is-half"></div>' +
        '<div class="skel skel-line is-full"></div>' +
        '<div class="skel skel-line is-full"></div>' +
        '<div class="skel skel-line is-3q"></div>' +
        '<div class="skel skel-line is-full"></div>' +
        '<div class="skel skel-line is-half"></div>' +
      '</div>'
  };

  /** 로딩 스켈레톤 렌더 */
  function renderLoading(host, kind) {
    if (!host) return;
    host.setAttribute('aria-busy', 'true');
    host.innerHTML =
      '<div class="sr-only" role="status" aria-live="polite">불러오는 중입니다.</div>' +
      (SKELETONS[kind] || SKELETONS.list);
  }

  /**
   * 빈 상태.
   * @param {Node} host
   * @param {Object} opt {icon, title, desc, actionText, actionHref, onAction}
   */
  function renderEmpty(host, opt) {
    if (!host) return;
    opt = opt || {};
    host.removeAttribute('aria-busy');

    var kids = [
      el('div', { className: 'state__ico' }, iconEl(opt.icon || 'empty')),
      el('p', { className: 'state__title', text: opt.title || '표시할 내용이 없습니다.' })
    ];
    if (opt.desc) kids.push(el('p', { className: 'state__desc', text: opt.desc }));

    if (opt.actionText) {
      var act;
      if (opt.actionHref) {
        act = el('a', { className: 'btn btn--line', attrs: { href: opt.actionHref }, text: opt.actionText });
      } else {
        act = el('button', { className: 'btn btn--line', attrs: { type: 'button' }, text: opt.actionText });
        if (opt.onAction) act.addEventListener('click', opt.onAction);
      }
      kids.push(el('div', { className: 'state__act' }, act));
    }

    clear(host).appendChild(el('div', { className: 'state' }, kids));
    paintIcons(host);
  }

  /**
   * 오류 상태 + 다시 시도.
   * @param {Node} host
   * @param {Error} err
   * @param {Function} onRetry
   */
  function renderError(host, err, onRetry) {
    if (!host) return;
    host.removeAttribute('aria-busy');

    var msg = (err && err.message) ? err.message : '데이터를 불러오지 못했습니다.';
    var code = (err && err.code) ? err.code : '';

    /* 세션 만료 / 이용 제한(탈퇴·정지)은 즉시 로그인 화면으로 */
    if (code === 'UNAUTHORIZED' || code === 'INACTIVE') {
      if (global.LFAuth) global.LFAuth.clearSession();
      global.location.replace(LOGIN_URL);
      return;
    }

    /* 서버 오류 코드별 안내 문구 (원인을 사용자가 구분할 수 있게 한다) */
    var title = '데이터를 불러오지 못했습니다';
    if (code === 'OUTDATED_SERVER') {
      title = '서버 점검이 필요합니다';
      msg = (global.LFAuth && global.LFAuth.OUTDATED_MSG) || msg;
    } else if (code === 'BUSY') {
      title = '잠시 후 다시 시도해 주세요';
      msg = '다른 요청이 처리 중입니다. 잠시 후 [다시 시도]를 눌러 주세요.';
    } else if (code === 'SCHEMA_MISMATCH') {
      title = '서버 데이터 구조 오류';
      msg = '데이터 저장소 구조에 문제가 있어 조회할 수 없습니다. ' +
            '담당자(yr.kwon@lfcorp.com)에게 문의해 주세요.';
    }

    var kids = [
      el('div', { className: 'state__ico state__ico--warn' }, iconEl('warn')),
      el('p', { className: 'state__title', text: title }),
      el('p', { className: 'state__desc', attrs: { role: 'alert', 'aria-live': 'polite' }, text: msg })
    ];

    var retry = el('button', { className: 'btn btn--primary', attrs: { type: 'button' } },
      [iconEl('refresh'), el('span', { text: '다시 시도' })]);
    retry.addEventListener('click', function () { if (onRetry) onRetry(); });

    var act = [retry];
    act.push(el('button', {
      className: 'btn btn--ghost', attrs: { type: 'button' }, text: '로그인 화면으로',
      on: { click: function () { global.location.replace(LOGIN_URL); } }
    }));
    kids.push(el('div', { className: 'state__act' }, act));

    clear(host).appendChild(el('div', { className: 'state' }, kids));
    paintIcons(host);
  }

  /* ------------------------------------------------------------------
     8. 페이지 부트스트랩  (stale-while-revalidate)

        세션 가드 → 뼈대 렌더
          ├─ 캐시 있음 → 즉시 render() (스켈레톤 생략) → 백그라운드 refresh()
          │                └─ 데이터가 실제로 바뀌면 조용히 재render()
          └─ 캐시 없음 → 스켈레톤 → load() → render()

        Apps Script 왕복은 2~4초로 서버 코드로는 줄일 수 없다.
        따라서 '기다리지 않게' 만드는 것이 이 함수의 목적이다.
     ------------------------------------------------------------------ */
  /**
   * @param {Object} opt
   *        {title, back, logout, skeleton}
   *        needsData:false → 사용자 데이터를 기다리지 않고 즉시 render()
   *                          (데이터가 나중에 도착하면 onUpdate 로 재렌더)
   * @param {Function} render (view, Store) — 본문을 그린다
   * @returns {Function} rerun — 다시 그리기. rerun.stop() 으로 자동 재렌더를 중단한다.
   */
  function boot(opt, render) {
    opt = opt || {};

    if (!global.LFAuth || typeof global.LFAuth.requireAuth !== 'function') {
      global.location.replace(LOGIN_URL);
      return;
    }
    if (!global.LFAuth.requireAuth()) return;   /* 미인증 → 로그인 페이지 이동, 즉시 중단 */

    var view = mountScreen(opt);
    if (!view) return;

    var Store = global.AffiliateStore;
    var stopped = false;      /* 화면이 다른 상태(예: 탈퇴 완료)로 넘어가면 재렌더 금지 */
    var toasted = false;      /* 갱신 안내 토스트는 1회만 */
    var hadCache = false;     /* 진입 시점에 캐시가 있었는가 (첫 도착 ≠ 업데이트) */

    /** 본문을 다시 그린다. */
    function paint() {
      setFoot('');
      view.removeAttribute('aria-busy');
      clear(view);
      render(view, Store);
      paintIcons($('#app'));
    }

    /** 항상 서버를 다시 조회한다. 실패해도 화면을 덮지 않는다. */
    function revalidate() {
      if (stopped || !Store || typeof Store.refresh !== 'function') return;
      setRefreshing(true);
      Store.refresh().then(function () { setRefreshing(false); },
                           function () { setRefreshing(false); });
    }

    /** 갱신 결과가 '실제로 달라졌을 때만' 호출된다. */
    function onUpdated() {
      if (stopped) return;
      paint();
      if (hadCache && !toasted) {
        toasted = true;
        toast('최신 정보로 업데이트되었습니다');
      }
    }

    /** 캐시가 없을 때의 기존 로딩 · 오류 · 재시도 경로 */
    function run() {
      if (stopped) return;
      /* 이미 데이터가 있으면(연락처 수정 직후 등) 스켈레톤 없이 바로 다시 그린다. */
      if (Store && Store.isLoaded && Store.isLoaded()) {
        paint();
        revalidate();
        return;
      }
      setFoot('');
      renderLoading(view, opt.skeleton);
      Store.load().then(function () {
        if (stopped) return;
        paint();
      })['catch'](function (err) {
        if (stopped) return;
        renderError(view, err, run);
      });
    }

    if (Store && typeof Store.onUpdate === 'function') Store.onUpdate(onUpdated);
    if (Store && typeof Store.onRefreshError === 'function') {
      Store.onRefreshError(function (err) {
        /* 세션 만료만 예외적으로 화면을 전환한다. 그 밖의 실패는 캐시 화면을 유지한다. */
        if (err && err.code === 'UNAUTHORIZED') {
          stopped = true;
          if (Store.clearCache) Store.clearCache();
          if (global.LFAuth) global.LFAuth.clearSession();
          global.location.replace(LOGIN_URL);
        }
      });
    }

    var cached = (Store && typeof Store.getCached === 'function') ? Store.getCached() : null;
    hadCache = !!cached;

    if (opt.needsData === false) {
      /* 사용자 데이터가 필요 없는 화면(이용약관 등) : 기다리지 않고 즉시 그린다. */
      paint();
      revalidate();
    } else if (cached) {
      /* 캐시 우선 렌더 : 스켈레톤 0초 */
      paint();
      revalidate();
    } else {
      run();
    }

    /** 자동 재렌더를 멈춘다. (탈퇴 완료 화면 등 되돌아가면 안 되는 상태) */
    run.stop = function () {
      stopped = true;
      setRefreshing(false);
    };

    return run;
  }

  /* ------------------------------------------------------------------
     9. 클립보드
     ------------------------------------------------------------------ */
  function copyText(text) {
    if (global.navigator && global.navigator.clipboard && global.isSecureContext) {
      return global.navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = doc.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      doc.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
      if (ta.parentNode) ta.parentNode.removeChild(ta);
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }

  /* ------------------------------------------------------------------
     10. 노출
     ------------------------------------------------------------------ */
  global.LF = {
    $: $, $$: $$,
    LOGIN_URL: LOGIN_URL,

    comma: comma,
    won: won,
    fmtDate: fmtDate,
    fmtYm: fmtYm,
    ratio: ratio,
    safeUrl: safeUrl,
    esc: esc,

    el: el,
    frag: frag,
    icon: iconEl,
    clear: clear,
    fill: fill,
    paintIcons: paintIcons,

    mountScreen: mountScreen,
    setBody: setBody,
    setFoot: setFoot,
    setRefreshing: setRefreshing,

    toast: toast,
    openModal: openModal,
    confirmModal: confirmModal,

    renderLoading: renderLoading,
    renderEmpty: renderEmpty,
    renderError: renderError,
    boot: boot,

    copyText: copyText
  };
})(window);
