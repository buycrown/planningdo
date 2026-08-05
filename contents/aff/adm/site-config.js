/* =========================================================
 * LFmall 어필리에이트 - 사이트 경로 설정 (site-config.js)  v1.0
 * LFSITE_VERSION: 1.0.0
 * =========================================================
 * [배치 위치] 아래 4곳에 '동일한 내용'으로 사본 배치합니다. (md5 동일)
 *   01_신청화면/site-config.js
 *   02_ADMIN/site-config.js
 *   03_활동내역/js/site-config.js
 *   04_로그인/js/site-config.js
 *
 * [왜 필요한가]
 *   로컬 폴더 구조와 배포 경로가 서로 다릅니다.
 *
 *     로컬 폴더            배포 경로                        배포 파일명
 *     01_신청화면/    →   /contents/aff/aff_join/          index.html
 *     04_로그인/      →   /contents/aff/aff_login/         index.html (← login.html)
 *     02_ADMIN/       →   /contents/aff/adm/               admin.html
 *     03_활동내역/    →   /contents/aff/aff_my/            affiliate.html
 *
 *   화면·HTML 마다 '../04_로그인/login.html' 같은 상대경로를 하드코딩해 두면
 *   배포에서 전부 404 가 됩니다. (2026-08 사고)
 *   경로는 이 파일 하나만 소유하고, 나머지는 LFSite.resolve() 로만 물어봅니다.
 *
 * [사용법]
 *   1) JS 에서   :  location.href = LFSite.resolve('login');
 *   2) HTML 에서 :  <a data-lf-link="login">로그인</a>
 *                   → 스크립트가 href 를 자동으로 채웁니다. (하드코딩 금지)
 *      쿼리를 붙이려면 data-lf-query="next=links.html"
 *
 * [로드 순서]  site-config.js  →  auth.js  →  나머지 화면 스크립트
 *
 * [문법] ES5 만 사용합니다. (var / function 선언, 화살표함수·템플릿리터럴 금지)
 * ========================================================= */
(function (global) {
  'use strict';

  /* =========================================================
   * ① 환경 판별 규칙  ★ 바꿀 일이 생기면 여기 한 곳만 고치세요.
   * ---------------------------------------------------------
   *   local  : localhost / 127.0.0.1 / 0.0.0.0 / ::1 / *.localhost
   *            그리고 hostname 이 빈 값인 경우(file:// 로 직접 열었을 때)
   *   deploy : 그 외 전부 (buycrown.cloud 등 실제 도메인)
   * ========================================================= */
  var LOCAL_HOST_RE = /^(?:|localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?|.+\.localhost)$/i;

  function detectEnv(loc) {
    var host = String((loc && loc.hostname) || '');
    return LOCAL_HOST_RE.test(host) ? 'local' : 'deploy';
  }

  /* =========================================================
   * ② 경로표  ★ 폴더가 바뀌면 여기 한 곳만 고치세요.
   * ========================================================= */
  var SCREENS = ['apply', 'login', 'my', 'admin'];

  /* 로컬 : '사이트 루트' 기준 경로 (각 화면에서의 상대경로가 아님) */
  var LOCAL_PATHS = {
    apply: '01_신청화면/index.html',
    login: '04_로그인/login.html',
    my:    '03_활동내역/affiliate.html',
    admin: '02_ADMIN/admin.html'
  };

  /* 배포 : GitHub Pages 절대경로 */
  var DEPLOY_BASE = '/contents/aff/';

  var DEPLOY_PATHS = {
    apply: DEPLOY_BASE + 'aff_join/index.html',
    login: DEPLOY_BASE + 'aff_login/index.html',
    my:    DEPLOY_BASE + 'aff_my/affiliate.html',
    admin: DEPLOY_BASE + 'adm/admin.html'
  };

  /* 폴더명 → 화면 키 (현재 문서가 어느 화면인지 + 사이트 루트 역산에 사용) */
  var LOCAL_DIR_KEY = {
    '01_신청화면': 'apply',
    '02_ADMIN':   'admin',
    '03_활동내역': 'my',
    '04_로그인':   'login'
  };

  var DEPLOY_DIR_KEY = {
    'aff_join':  'apply',
    'aff_login': 'login',
    'aff_my':    'my',
    'adm':       'admin'
  };

  /*
   * 파일명 → 화면 키.
   * 화면 폴더 자체를 서버 루트로 띄운 경우(폴더명이 URL 에 없다)의 폴백이다.
   *   예) 04_로그인 폴더에서 python -m http.server → /login.html
   */
  var FILE_KEY = {
    'index.html':     'apply',
    'login.html':     'login',
    'admin.html':     'admin',
    'affiliate.html': 'my',
    'creator.html':   'my',
    'links.html':     'my',
    'revenue.html':   'my',
    'terms.html':     'my',
    'withdraw.html':  'my'
  };

  /* =========================================================
   * ③ 유틸
   * ========================================================= */
  function has(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }

  /** pathname 을 '/' 단위로 쪼갠다. (퍼센트 인코딩된 한글 폴더명 복원 포함) */
  function segmentsOf(pathname) {
    var p = String(pathname == null ? '' : pathname);
    try { p = decodeURIComponent(p); } catch (e) { /* 잘못된 인코딩은 원문 사용 */ }
    return p.split('/');
  }

  /* =========================================================
   * ④ 인스턴스 생성
   *    location / document 를 주입받는다.
   *    → Node 테스트에서 LFSite.create(스텁) 으로 3가지 환경을 재현할 수 있다.
   * ========================================================= */
  function create(loc, doc) {
    var env = detectEnv(loc);
    var segs = segmentsOf(loc && loc.pathname);
    var file = segs.length ? segs[segs.length - 1] : '';
    var dirMap = env === 'deploy' ? DEPLOY_DIR_KEY : LOCAL_DIR_KEY;

    /* --- 현재 화면 키 + 사이트 루트 역산 --------------------
     * 경로 안에 알려진 화면 폴더명이 있으면 그 앞까지가 사이트 루트다.
     *   /01_신청화면/index.html          → root '/'
     *   /aff/03_활동내역/links.html      → root '/aff/'
     * 없으면 화면 폴더 자체를 루트로 띄운 것이므로 한 단계 위를 루트로 본다.
     *   /login.html                      → root '../'
     * ------------------------------------------------------ */
    var current = '';
    var rootIdx = -1;
    for (var i = 0; i < segs.length; i++) {
      if (segs[i] && has(dirMap, segs[i])) { current = dirMap[segs[i]]; rootIdx = i; break; }
    }
    if (!current && has(FILE_KEY, file)) current = FILE_KEY[file];

    var root;
    if (env === 'deploy') root = DEPLOY_BASE;
    else if (rootIdx >= 0) root = segs.slice(0, rootIdx).join('/') + '/';
    else root = '../';

    /** 화면 키 → 브라우저가 그대로 쓸 수 있는 URL */
    function build(key) {
      if (!has(LOCAL_PATHS, key)) return '';
      if (env === 'deploy') return DEPLOY_PATHS[key];
      var rel = LOCAL_PATHS[key];
      /* 지금 있는 화면 폴더와 같은 폴더라면 폴더를 거치지 않고 파일명만 쓴다.
         (화면 폴더를 루트로 서빙해도, 프로젝트 루트로 서빙해도 항상 맞는다) */
      if (key === current) return rel.split('/').pop();
      return root + rel;
    }

    var paths = {};
    for (var k = 0; k < SCREENS.length; k++) paths[SCREENS[k]] = build(SCREENS[k]);

    /**
     * 화면 키에 해당하는 URL 을 돌려준다.
     * @param {string} key 'apply' | 'login' | 'my' | 'admin'
     * @returns {string} 브라우저가 그대로 쓸 수 있는 URL ('' 이면 알 수 없는 키)
     */
    function resolve(key) {
      var k2 = String(key == null ? '' : key);
      if (!has(paths, k2)) {
        if (global.console && global.console.warn) global.console.warn('[LFSite] 알 수 없는 경로 키: ' + k2);
        return '';
      }
      return paths[k2];
    }

    /** 화면 키가 들어 있는 '디렉터리' URL (끝에 '/' 포함). 하위 문서 이동에 쓴다. */
    function dir(key) {
      var u = resolve(key);
      var i2 = u.lastIndexOf('/');
      return i2 === -1 ? '' : u.slice(0, i2 + 1);
    }

    /** 같은 화면 폴더 안의 다른 문서 URL. (예: sibling('my','links.html')) */
    function sibling(key, fileName) {
      return dir(key) + String(fileName == null ? '' : fileName);
    }

    /**
     * [data-lf-link] 속성을 가진 요소의 href 를 채운다.
     * HTML 에 경로를 하드코딩하지 않기 위한 장치다.
     * @returns {number} 채운 개수
     */
    function applyLinks(scope) {
      var d = scope || doc;
      if (!d || typeof d.querySelectorAll !== 'function') return 0;
      var nodes = d.querySelectorAll('[data-lf-link]');
      var n = 0;
      for (var j = 0; j < nodes.length; j++) {
        var el = nodes[j];
        var url = resolve(el.getAttribute('data-lf-link'));
        if (!url) continue;
        var q = el.getAttribute('data-lf-query');
        if (q) url += (url.indexOf('?') === -1 ? '?' : '&') + q;
        el.setAttribute('href', url);
        n++;
      }
      return n;
    }

    return {
      VERSION: '1.0.0',
      env: env,
      current: current,
      root: root,
      paths: paths,
      resolve: resolve,
      dir: dir,
      sibling: sibling,
      applyLinks: applyLinks,
      /* 설정 원본 (테스트·문서화용, 런타임에서 수정하지 말 것) */
      LOCAL_PATHS: LOCAL_PATHS,
      DEPLOY_PATHS: DEPLOY_PATHS,
      DEPLOY_BASE: DEPLOY_BASE
    };
  }

  /* =========================================================
   * ⑤ 노출
   * ========================================================= */
  var site = create(global.location, global.document);
  site.create = create;         /* 테스트에서 location 스텁을 주입할 때 사용 */
  site.detectEnv = detectEnv;
  global.LFSite = site;

  if (global.document) {
    /* 스크립트가 body 끝에 있는 화면은 이 시점에 이미 링크가 파싱돼 있고,
       <head> 에 있는 화면은 DOMContentLoaded 에서 채워진다. (양쪽 다 안전, 멱등) */
    site.applyLinks();
    if (global.document.addEventListener) {
      global.document.addEventListener('DOMContentLoaded', function () { site.applyLinks(); });
    }
  }

  /* Node 하네스에서 require 할 수 있게 (브라우저 동작에는 영향 없음) */
  if (typeof module !== 'undefined' && module.exports) module.exports = site;
})(typeof window !== 'undefined' ? window : this);
