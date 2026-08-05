/* =========================================================
 * LFmall 어필리에이트 - 로그인 화면 제어 (login.js)  v2.0
 * ---------------------------------------------------------
 * [설계 원칙]
 *  - HTML(login.html)과 완전히 분리된 순수 JS.
 *    인라인 <script> / onclick 등 인라인 핸들러를 사용하지 않는다.
 *  - ES5 호환 문법만 사용한다. (var / function 선언, 화살표 함수·템플릿 리터럴 금지)
 *  - 사용자 입력은 절대 innerHTML 로 넣지 않고 textContent 로만 출력한다. (XSS 방지)
 *  - 인증·통신·해싱은 전부 공용 모듈 window.LFAuth 가 담당한다.
 *    이 파일은 "화면 제어"만 책임진다.
 *
 * [로드 순서] js/auth.js  →  js/login.js
 * ========================================================= */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------
   * 0. 공용 모듈 경로 설정
   *    로그인 화면 기준의 상대경로를 LFAuth 에 주입한다.
   * --------------------------------------------------------- */
  if (!global.LFAuth) {
    /* auth.js 로드 실패 시 조용히 죽지 않도록 콘솔에 남긴다. */
    if (global.console && global.console.error) {
      global.console.error('[login.js] auth.js 가 먼저 로드되어야 합니다.');
    }
    return;
  }

  var LFAuth = global.LFAuth;

  LFAuth.config({
    loginUrl: 'login.html',
    homeUrl: '../03_활동내역/affiliate.html',
    applyUrl: '../01_신청화면/index.html'
  });

  /* ---------------------------------------------------------
   * 1. 상수
   * --------------------------------------------------------- */
  /* 활동내역 폴더 경로 (성공 시 이동 기준 디렉터리) */
  var HOME_DIR = '../03_활동내역/';
  /* 기본 진입 페이지 */
  var HOME_PAGE = 'affiliate.html';
  /*
   * ?next= 값 허용 패턴.
   * 경로 조작(../, //host, javascript: 등)을 원천 차단하기 위해
   * "파일명.html" 또는 "파일명.html?쿼리" 형태만 허용한다.
   */
  var NEXT_RE = /^[A-Za-z0-9._-]+\.html(\?.*)?$/;

  /* 실패 시 노출할 기본 메시지 (서버 메시지가 없을 때만 사용) */
  var DEFAULT_ERR = '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.';

  /* 서버가 구버전으로 배포돼 있음이 확인되면 true (폼 차단 상태) */
  var serverOutdated = false;

  /* ---------------------------------------------------------
   * 2. DOM 참조
   * --------------------------------------------------------- */
  var el = {};

  /** 화면에서 사용할 DOM 요소를 한 번에 수집한다. */
  function collectDom() {
    el.page = document.getElementById('page');
    el.form = document.getElementById('loginForm');
    el.identifier = document.getElementById('identifier');
    el.idBadge = document.getElementById('idBadge');
    el.password = document.getElementById('password');
    el.pwToggle = document.getElementById('pwToggle');
    el.btnLogin = document.getElementById('btnLogin');
    el.btnLabel = document.getElementById('btnLoginLabel');
    el.spinner = document.getElementById('btnSpinner');
    el.btnApply = document.getElementById('btnApply');
    el.alert = document.getElementById('formAlert');
    el.insecure = document.getElementById('insecureBanner');
  }

  /* ---------------------------------------------------------
   * 3. 알림(에러 / 잠금) 표시 유틸
   * --------------------------------------------------------- */
  /**
   * 폼 상단 알림 영역에 메시지를 표시한다.
   * 토스트가 아니라 사용자가 지울 때까지 남아 있는 영역이다.
   * @param {string} msg     표시할 메시지 (textContent 로만 주입)
   * @param {string} variant 강조 유형
   *        ''        기본 (입력 오류 등)
   *        'locked'  계정 잠금 → '🔒 계정 잠금' 헤더 + 강조
   *        'notice'  사용자가 해결할 수 없는 안내 → 강조만 (잠금 헤더 없음)
   *
   * ⚠️ 'locked' 는 실제 LOGIN 5회 실패 잠금에만 사용한다.
   *    서버 구버전·스키마 오류·정지 계정에 쓰면 '계정 잠금'으로 오인된다.
   */
  function showAlert(msg, variant) {
    if (!el.alert) return;
    el.alert.textContent = String(msg == null ? '' : msg);
    if (variant === 'locked') el.alert.className = 'form-alert is-locked';
    else if (variant === 'notice') el.alert.className = 'form-alert is-notice';
    else el.alert.className = 'form-alert';
    el.alert.hidden = false;
  }

  /** 폼 상단 알림 영역을 비운다. */
  function clearAlert() {
    if (!el.alert) return;
    el.alert.textContent = '';
    el.alert.className = 'form-alert';
    el.alert.hidden = true;
  }

  /** 특정 입력 필드를 오류 상태로 표시/해제한다. */
  function markInvalid(input, invalid) {
    if (!input) return;
    var field = input.closest ? input.closest('.field') : null;
    if (!field) return;
    if (invalid) field.className = field.className.indexOf('is-invalid') === -1
      ? field.className + ' is-invalid'
      : field.className;
    else field.className = field.className.replace(/\s*is-invalid/g, '');
  }

  /* ---------------------------------------------------------
   * 4. 아이디 입력 처리 (이메일 / 휴대폰번호 자동 판별)
   * --------------------------------------------------------- */
  /**
   * 입력값이 숫자로 시작하는지(= 휴대폰번호 입력 의도) 판단한다.
   * 앞뒤 공백은 무시한다.
   */
  function looksLikePhoneInput(v) {
    var s = String(v == null ? '' : v).trim();
    return /^[0-9]/.test(s);
  }

  /**
   * 아이디 입력값을 실시간 가공한다.
   *  - 숫자로 시작하면 LFAuth.formatPhone() 으로 하이픈 자동 삽입 (커서 위치 보정)
   *  - 이메일 형태면 값은 그대로 두고 배지만 갱신
   *  - inputmode 를 tel / email 로 동적 전환
   */
  function handleIdentifierInput() {
    var input = el.identifier;
    if (!input) return;
    var raw = input.value;

    if (looksLikePhoneInput(raw)) {
      /* 커서가 문자열 끝에 있는지 확인 후, 끝일 때만 포맷 결과 끝으로 커서를 보낸다. */
      var atEnd = (input.selectionStart === raw.length);
      var formatted = LFAuth.formatPhone(raw);
      if (formatted !== raw) {
        input.value = formatted;
        if (atEnd) {
          try { input.setSelectionRange(formatted.length, formatted.length); } catch (e) {}
        }
      }
      setInputMode('tel');
    } else {
      setInputMode('email');
    }
    updateIdBadge();
  }

  /** 아이디 입력창의 inputmode 속성을 전환한다. (모바일 키보드 최적화) */
  function setInputMode(mode) {
    if (!el.identifier) return;
    if (el.identifier.getAttribute('inputmode') !== mode) {
      el.identifier.setAttribute('inputmode', mode);
    }
  }

  /**
   * 현재 입력값의 식별자 유형 배지를 갱신한다.
   *  - 이메일 형식 완성 → '이메일로 로그인'
   *  - 휴대폰번호 형식 완성 → '휴대폰번호로 로그인'
   *  - 그 외(입력 중/미입력) → 배지 숨김
   */
  function updateIdBadge() {
    if (!el.idBadge || !el.identifier) return;
    var v = el.identifier.value;
    var type = LFAuth.identifierType(v);

    if (type === 'email') {
      el.idBadge.textContent = '이메일로 로그인';
      el.idBadge.className = 'id-badge is-email';
      el.idBadge.hidden = false;
    } else if (type === 'phone') {
      el.idBadge.textContent = '휴대폰번호로 로그인';
      el.idBadge.className = 'id-badge is-phone';
      el.idBadge.hidden = false;
    } else {
      el.idBadge.textContent = '';
      el.idBadge.className = 'id-badge';
      el.idBadge.hidden = true;
    }
  }

  /**
   * 포커스가 빠질 때 이메일은 소문자로 정규화해 준다.
   * (서버 비교 규칙과 동일하게 맞춰 사용자 혼선을 줄인다)
   */
  function handleIdentifierBlur() {
    if (!el.identifier) return;
    var v = String(el.identifier.value || '').trim();
    if (!v) { el.identifier.value = ''; return; }
    if (LFAuth.isEmail(v)) el.identifier.value = v.toLowerCase();
    else el.identifier.value = v;
    updateIdBadge();
  }

  /* ---------------------------------------------------------
   * 5. 비밀번호 표시/숨김 토글
   * --------------------------------------------------------- */
  /** 비밀번호 입력의 type 을 전환하고 aria-pressed 를 갱신한다. */
  function togglePassword() {
    if (!el.password || !el.pwToggle) return;
    var show = el.password.type === 'password';
    el.password.type = show ? 'text' : 'password';
    el.pwToggle.setAttribute('aria-pressed', show ? 'true' : 'false');
    el.pwToggle.setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 표시');
    /* 토글 후에도 입력을 이어갈 수 있도록 포커스를 되돌린다. */
    try {
      var pos = el.password.value.length;
      el.password.focus();
      el.password.setSelectionRange(pos, pos);
    } catch (e) {}
  }

  /* ---------------------------------------------------------
   * 6. 로딩 상태 제어
   * --------------------------------------------------------- */
  /** 로그인 버튼을 로딩(비활성 + 스피너) 상태로 전환한다. */
  function setLoading(loading) {
    if (el.btnLogin) el.btnLogin.disabled = !!loading;
    if (el.spinner) el.spinner.hidden = !loading;
    if (el.btnLabel) el.btnLabel.textContent = loading ? '로그인 중…' : '로그인';
    if (el.identifier) el.identifier.readOnly = !!loading;
    if (el.password) el.password.readOnly = !!loading;
    if (el.pwToggle) el.pwToggle.disabled = !!loading;
  }

  /* ---------------------------------------------------------
   * 7. 이동 목적지 계산
   * --------------------------------------------------------- */
  /**
   * URL 쿼리스트링에서 파라미터 값을 읽는다. (URLSearchParams 미사용 - 구형 호환)
   */
  function getQueryParam(name) {
    var q = global.location.search;
    if (!q || q.length < 2) return '';
    var pairs = q.substring(1).split('&');
    for (var i = 0; i < pairs.length; i++) {
      var idx = pairs[i].indexOf('=');
      var k = idx === -1 ? pairs[i] : pairs[i].substring(0, idx);
      if (decodeURIComponent(k) !== name) continue;
      var raw = idx === -1 ? '' : pairs[i].substring(idx + 1);
      try { return decodeURIComponent(raw.replace(/\+/g, ' ')); } catch (e) { return ''; }
    }
    return '';
  }

  /**
   * 로그인 성공 후 이동할 URL 을 계산한다.
   * ?next= 값은 NEXT_RE 패턴(파일명.html[?쿼리])에 정확히 맞을 때만 허용하며,
   * 그 외에는 무조건 기본 활동내역 페이지로 보낸다. (경로 조작 방지)
   */
  function resolveNextUrl() {
    var next = getQueryParam('next');
    if (next && NEXT_RE.test(next)) return HOME_DIR + next;
    return HOME_DIR + HOME_PAGE;
  }

  /* ---------------------------------------------------------
   * 7-1. 활동내역 데이터 프리페치
   * --------------------------------------------------------- */
  /**
   * 로그인 성공 직후 'userMe' 를 미리 호출해 활동내역 캐시(sessionStorage)에 심어 둔다.
   *
   * Apps Script 왕복은 2~4초로 서버 코드로 줄일 수 없다.
   * 활동내역 첫 진입에서 그 시간을 스켈레톤으로 보내는 대신,
   * 이동이 시작되는 시점에 요청을 미리 띄워 둔다.
   *
   * [지켜야 할 것]
   *  - 이 함수는 절대로 화면 이동을 지연시키지 않는다. Promise 를 기다리지 않고 즉시 반환한다.
   *  - 실패는 전부 무시한다. 활동내역 화면이 정상적으로 다시 로드한다.
   *  - 캐시 키·저장 형식은 LFAuth.writeAffiliateCache 가 단독으로 소유한다.
   *    (03_활동내역/js/data.js 와 동일한 헬퍼를 공유하므로 형식이 어긋날 수 없다)
   *
   * [한계] 응답이 도착하기 전에 다음 문서가 커밋되면 브라우저가 요청을 취소한다.
   *        따라서 '되면 이득, 안 되면 본전'인 최적화다. 이동을 붙잡아 두지는 않는다.
   */
  function prefetchAffiliateData() {
    if (!LFAuth || typeof LFAuth.api !== 'function') return;
    if (typeof LFAuth.writeAffiliateCache !== 'function') return;
    try {
      LFAuth.api('userMe').then(function (res) {
        try { LFAuth.writeAffiliateCache(res); } catch (e) {}
      }, function () { /* 프리페치 실패는 무시 */ });
    } catch (e) { /* 프리페치는 어떤 경우에도 로그인 흐름을 막지 않는다 */ }
  }

  /* ---------------------------------------------------------
   * 8. 로그인 제출
   * --------------------------------------------------------- */
  /**
   * 폼 제출 처리.
   * 1) 입력값 검증 → 2) 로딩 시작 → 3) LFAuth.login() (challenge → PBKDF2 → userLogin)
   * 4) 성공 시 sessionStorage 세션이 저장된 상태로 활동내역 이동
   *    (이동 직전 userMe 프리페치를 띄워 첫 진입 스켈레톤을 줄인다)
   */
  function handleSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (el.btnLogin && el.btnLogin.disabled) return;

    clearAlert();
    markInvalid(el.identifier, false);
    markInvalid(el.password, false);

    /* 보안 컨텍스트가 아니면 애초에 진행하지 않는다. */
    if (!LFAuth.isSecureContextOk()) {
      showAlert(LFAuth.INSECURE_MSG, 'notice');
      return;
    }

    /* 서버가 구버전이면 어떤 비밀번호로도 로그인할 수 없다.
       안내는 상단 배너에 이미 떠 있으므로 폼 알림에 중복 노출하지 않는다. */
    if (serverOutdated) {
      blockForOutdatedServer(LFAuth.OUTDATED_MSG);
      return;
    }

    var id = el.identifier ? String(el.identifier.value || '').trim() : '';
    var pw = el.password ? String(el.password.value || '') : '';

    if (!id) {
      showAlert('이메일 또는 휴대폰번호를 입력해 주세요.', '');
      markInvalid(el.identifier, true);
      if (el.identifier) el.identifier.focus();
      return;
    }
    if (!pw) {
      showAlert('비밀번호를 입력해 주세요.', '');
      markInvalid(el.password, true);
      if (el.password) el.password.focus();
      return;
    }

    setLoading(true);

    LFAuth.login(id, pw).then(
      function () {
        /* 성공 : 세션(sessionStorage)은 LFAuth 가 이미 저장했다. */
        /* 활동내역 데이터를 미리 요청해 둔다. (이동을 기다리지 않는다) */
        prefetchAffiliateData();
        global.location.href = resolveNextUrl();
      },
      function (err) {
        setLoading(false);
        var code = err && err.code ? err.code : '';
        var msg = (err && err.message) ? err.message : DEFAULT_ERR;

        /* 서버 구버전(재배포 누락) : 비밀번호 문제가 아니므로 별도로 강조 표시하고
           폼을 차단해 사용자가 같은 시도를 반복하지 않게 한다. */
        if (code === 'OUTDATED_SERVER') {
          blockForOutdatedServer(msg);
          return;
        }

        /* 동시 요청 충돌 : 비밀번호 문제가 아니므로 입력값을 지우지 않고 재시도만 안내한다. */
        if (code === 'BUSY') {
          showAlert('다른 요청이 처리 중입니다. 잠시 후 다시 로그인해 주세요.', '');
          return;
        }
        /* DB 시트 구조 오류 : 사용자가 해결할 수 없으므로 담당자 안내로 대체한다. */
        if (code === 'SCHEMA_MISMATCH') {
          showAlert('서버 데이터 저장소 구조에 문제가 있어 로그인할 수 없습니다.\n' +
                    '담당자(yr.kwon@lfcorp.com)에게 문의해 주세요.', 'notice');
          return;
        }
        /* 정지·탈퇴 계정 : 비밀번호 재입력을 유도하지 않는다. */
        if (code === 'INACTIVE') {
          showAlert(msg, 'notice');
          return;
        }

        showAlert(msg, code === 'LOCKED' ? 'locked' : '');
        markInvalid(el.password, true);

        /* 잠금 상태에서는 재입력을 유도하지 않는다. */
        if (code !== 'LOCKED' && el.password) {
          el.password.value = '';
          el.password.focus();
        }
      }
    );
  }

  /* ---------------------------------------------------------
   * 9. 키보드 처리 (Enter)
   * --------------------------------------------------------- */
  /**
   * 아이디 입력란에서 Enter → 비밀번호가 비어 있으면 비밀번호로 포커스 이동,
   * 이미 입력돼 있으면 곧바로 제출한다.
   */
  function handleIdentifierKeydown(e) {
    var key = e.key || e.keyCode;
    if (key !== 'Enter' && key !== 13) return;
    e.preventDefault();
    if (el.password && !el.password.value) { el.password.focus(); return; }
    handleSubmit(e);
  }

  /* ---------------------------------------------------------
   * 10. 진입 가드
   * --------------------------------------------------------- */
  /**
   * 이미 유효 세션이 있으면 활동내역으로 즉시 이동한다.
   * 뒤로가기로 로그인 화면이 다시 쌓이지 않도록 replace 를 사용한다.
   * @return {boolean} 리다이렉트했으면 true
   */
  function redirectIfAuthed() {
    if (!LFAuth.isAuthed()) return false;
    global.location.replace(resolveNextUrl());
    return true;
  }

  /**
   * WebCrypto 사용 불가(비보안 컨텍스트) 시
   * 경고 배너를 노출하고 폼 전체를 비활성화한다.
   * @return {boolean} 차단되었으면 true
   */
  function guardSecureContext() {
    if (LFAuth.isSecureContextOk()) return false;

    if (el.insecure) {
      /* INSECURE_MSG 의 줄바꿈은 CSS white-space: pre-line 으로 유지된다. */
      el.insecure.textContent = LFAuth.INSECURE_MSG;
      el.insecure.hidden = false;
    }
    if (el.identifier) el.identifier.disabled = true;
    if (el.password) el.password.disabled = true;
    if (el.pwToggle) el.pwToggle.disabled = true;
    if (el.btnLogin) el.btnLogin.disabled = true;
    if (el.page) el.page.className = 'page is-blocked';
    return true;
  }

  /**
   * 서버 구버전 배포 감지 시 : 경고 배너 노출 + 폼 비활성화.
   * 보안 컨텍스트 경고와 동일한 배너 UI(#insecureBanner)를 재사용한다.
   * @param {string} msg 안내 문구 (textContent 로만 주입)
   */
  function blockForOutdatedServer(msg) {
    serverOutdated = true;
    if (el.insecure) {
      el.insecure.textContent = msg || LFAuth.OUTDATED_MSG;
      el.insecure.hidden = false;
    }
    if (el.identifier) el.identifier.disabled = true;
    if (el.password) el.password.disabled = true;
    if (el.pwToggle) el.pwToggle.disabled = true;
    if (el.btnLogin) el.btnLogin.disabled = true;
    if (el.page) el.page.className = 'page is-blocked';
    /* 동일 문구가 배너와 폼 알림에 이중으로 노출되지 않도록 폼 알림은 비운다. */
    clearAlert();
  }

  /**
   * 서버 배포 버전 자가 진단.
   * 구버전(v1)이 배포돼 있으면 v2 전용 액션이 없어 어떤 계정도 로그인할 수 없으므로
   * 진입 즉시 감지해 원인을 화면에 그대로 안내한다.
   */
  function checkServerVersion() {
    if (!LFAuth.checkServer) return;
    LFAuth.checkServer().then(function (info) {
      if (info && info.outdated) blockForOutdatedServer(info.message);
    }, function () { /* 네트워크 오류는 로그인 시도 시 다시 안내된다 */ });
  }

  /* ---------------------------------------------------------
   * 11. 이벤트 바인딩
   * --------------------------------------------------------- */
  /** 모든 화면 이벤트를 연결한다. (인라인 핸들러 미사용) */
  function bindEvents() {
    if (el.form) el.form.addEventListener('submit', handleSubmit);
    if (el.identifier) {
      el.identifier.addEventListener('input', handleIdentifierInput);
      el.identifier.addEventListener('blur', handleIdentifierBlur);
      el.identifier.addEventListener('keydown', handleIdentifierKeydown);
    }
    if (el.password) {
      /* 재입력을 시작하면 이전 오류 표시를 걷어낸다. */
      el.password.addEventListener('input', function () { markInvalid(el.password, false); });
    }
    if (el.pwToggle) el.pwToggle.addEventListener('click', togglePassword);
  }

  /* ---------------------------------------------------------
   * 12. 초기화
   * --------------------------------------------------------- */
  /** 화면 초기 진입 시 1회 실행되는 부트스트랩. */
  function init() {
    collectDom();

    /* ① 이미 로그인된 상태면 곧바로 활동내역으로 이동 */
    if (redirectIfAuthed()) return;

    bindEvents();

    /* ② 보안 컨텍스트(HTTPS/localhost) 확인 → 미충족 시 폼 차단 */
    if (guardSecureContext()) return;

    /* ②-b 서버 배포 버전 확인 (비동기) → 구버전이면 배너 + 폼 차단 */
    checkServerVersion();

    /* ③ 초기 포커스 : 모바일에서는 키보드가 바로 뜨지 않도록 데스크톱에서만 */
    var isTouch = ('ontouchstart' in global) || (navigator.maxTouchPoints > 0);
    if (!isTouch && el.identifier) el.identifier.focus();

    updateIdBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
