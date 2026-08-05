/* =========================================================
 * LFmall 어필리에이트 - 공용 인증 모듈 (auth.js)  v2.0
 * =========================================================
 * [배치 위치] 아래 4곳에 '동일한 내용'으로 사본 배치합니다.
 *   01_신청화면/auth.js
 *   02_ADMIN/auth.js
 *   03_활동내역/js/auth.js
 *   04_로그인/js/auth.js
 *
 * [로드 순서] ★ site-config.js → auth.js → 화면 스크립트
 *   화면 이동 경로(loginUrl/homeUrl/applyUrl)는 site-config.js 의 window.LFSite 가
 *   단독으로 소유합니다. 이 파일에도, 화면 코드에도 경로를 하드코딩하지 마세요.
 *   (로컬 폴더명과 배포 경로가 다릅니다 — site-config.js 주석의 매핑표 참고)
 *
 * [설계 원칙]
 *  - HTML과 완전히 분리된 순수 JS. 전역 window.LFAuth 로만 노출합니다.
 *  - ES Module(import/export) 미사용 → 구형 브라우저 및 정적 호스팅 호환.
 *  - 평문 비밀번호는 네트워크로 절대 전송하지 않습니다.
 *    클라이언트에서 PBKDF2-SHA256(120,000회)로 키 스트레칭한 결과만 전송합니다.
 *  - 서버 교체(Apps Script → LFmall DB) 시 config({apiUrl}) 와
 *    _request() 내부만 수정하면 화면 코드는 무수정입니다.
 *
 * [주의] WebCrypto(crypto.subtle)는 보안 컨텍스트에서만 동작합니다.
 *        HTTPS 또는 http://localhost 로 접속해야 하며,
 *        file:// 로 직접 열면 로그인/가입이 동작하지 않습니다.
 * ========================================================= */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------
   * 0. 설정
   * --------------------------------------------------------- */
  /**
   * 화면 이동 경로를 site-config.js(window.LFSite) 에서 가져온다.
   * LFSite 가 없거나(로드 실패·구버전 배포) 키를 모르면 폴백 값을 쓴다. — 안전장치
   * @param {string} key      'login' | 'my' | 'apply' | 'admin'
   * @param {string} fallback LFSite 가 없을 때 쓸 기존 상대경로
   * @returns {string}
   */
  function sitePath(key, fallback) {
    var S = global.LFSite;
    if (S && typeof S.resolve === 'function') {
      try {
        var v = S.resolve(key);
        if (v) return v;
      } catch (e) { /* 폴백으로 진행 */ }
    }
    return fallback;
  }

  var CFG = {
    /* Apps Script 웹앱 URL (4개 화면 모두 동일 값 사용) */
    apiUrl: 'https://script.google.com/macros/s/AKfycbwVjfkUZPKJfF7Ma6AriDgkbMISNTH7qaCh_Os5TgLkF5hx7rYFNocDLmZl3LyEr1J6Ug/exec',
    /* ★ 화면 이동 경로 — LFSite(site-config.js) 가 환경(local/deploy)에 맞춰 계산한다.
       화면 코드에서 LFAuth.config({loginUrl:...}) 로 덮어쓰지 마세요. */
    /* 미인증 시 이동할 로그인 페이지 */
    loginUrl: sitePath('login', '../04_로그인/login.html'),
    /* 로그인 성공 후 이동할 활동내역 페이지 */
    homeUrl: sitePath('my', '../03_활동내역/affiliate.html'),
    /* 가입 신청 페이지 */
    applyUrl: sitePath('apply', '../01_신청화면/index.html'),
    /* ADMIN 페이지 */
    adminUrl: sitePath('admin', '../02_ADMIN/admin.html'),
    /* 세션 토큰 저장 키 (sessionStorage: 탭 종료 시 자동 소멸) */
    tokenKey: 'lf_user_token',
    profileKey: 'lf_user_profile',
    /*
     * 활동내역(userMe) 응답 캐시 키.
     * 03_활동내역은 6개 문서로 분리돼 있어 페이지를 이동하면 메모리 캐시가 사라진다.
     * 같은 탭 안에서만 살아 있는 sessionStorage 에 응답 원본을 보관해
     * 재진입 시 스켈레톤 없이 즉시 렌더한다.
     * ⚠️ localStorage 는 사용하지 않는다. (탭을 닫아도 개인정보가 남으면 안 된다)
     */
    affiliateCacheKey: 'lf_affiliate_cache_v1',
    /* PBKDF2 파라미터 */
    iterations: 120000,
    keyLen: 32
  };

  /**
   * 이 클라이언트가 요구하는 서버 API 레벨.
   * 서버(apps-script.gs)의 API_LEVEL 이 이 값보다 낮으면 '구버전 배포' 로 판정한다.
   *
   * [v2.2] 2 → 3. 01_신청화면이 emailCheck 액션에 실제로 의존하기 시작했다.
   *   emailCheck 가 없는 서버(API_LEVEL 2 이하)에서는 이메일 중복확인이
   *   영원히 통과되지 않아 신청 자체가 불가능하므로, 클릭 시점이 아니라
   *   **화면 진입 즉시** 구버전으로 판정하고 재배포 안내를 띄운다.
   *   ★ 반드시 서버(API_LEVEL=3) 를 먼저 재배포한 뒤 이 파일들을 올린다.
   */
  var EXPECTED_API_LEVEL = 3;

  /* 구버전 서버가 배포돼 있을 때 화면에 그대로 노출할 안내 문구 */
  var OUTDATED_MSG =
    '서버(Google Apps Script)가 구버전으로 배포되어 있습니다.\n' +
    'apps-script.gs 최신본을 반영하고 initServer() 실행 후\n' +
    "'배포 관리 → 새 버전'으로 재배포해 주세요.";

  /* 구버전 서버가 미지원 액션에 대해 돌려주는 메시지 */
  var UNKNOWN_ACTION_MSG = '알 수 없는 요청입니다.';

  function config(patch) {
    if (!patch) return CFG;
    Object.keys(patch).forEach(function (k) {
      if (patch[k] !== undefined && patch[k] !== null) CFG[k] = patch[k];
    });
    return CFG;
  }

  /* ---------------------------------------------------------
   * 1. 보안 컨텍스트 점검
   * --------------------------------------------------------- */
  function isSecureContextOk() {
    return !!(global.crypto && global.crypto.subtle && global.crypto.getRandomValues);
  }

  var INSECURE_MSG =
    '보안 연결(HTTPS) 환경에서만 로그인·가입할 수 있습니다.\n' +
    'HTML 파일을 직접 열지 마시고 HTTPS 주소로 접속해 주세요.\n' +
    '(로컬 확인 시: 해당 폴더에서 python -m http.server 8000 실행 후 http://localhost:8000 접속)';

  function assertSecure() {
    if (!isSecureContextOk()) {
      var e = new Error(INSECURE_MSG);
      e.code = 'INSECURE_CONTEXT';
      throw e;
    }
  }

  /* ---------------------------------------------------------
   * 2. 바이트 · HEX 유틸
   * --------------------------------------------------------- */
  function bytesToHex(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += ('0' + b[i].toString(16)).slice(-2);
    return s;
  }

  /** 암호학적 난수 salt (기본 16 bytes → hex 32자) */
  function randomSaltHex(byteLen) {
    assertSecure();
    var buf = new Uint8Array(byteLen || 16);
    global.crypto.getRandomValues(buf);
    return bytesToHex(buf);
  }

  /* ---------------------------------------------------------
   * 3. 키 스트레칭 — PBKDF2-SHA256
   *    derive(password, saltHex) → Promise<hex(64)>
   * --------------------------------------------------------- */
  function derive(password, saltHex) {
    try { assertSecure(); } catch (e) { return Promise.reject(e); }
    var enc = new TextEncoder();
    return global.crypto.subtle
      .importKey('raw', enc.encode(String(password)), { name: 'PBKDF2' }, false, ['deriveBits'])
      .then(function (key) {
        return global.crypto.subtle.deriveBits(
          {
            name: 'PBKDF2',
            /* 버전 프리픽스를 붙여 향후 알고리즘 교체 시 구분 가능하게 함 */
            salt: enc.encode('lfa.v1|' + String(saltHex)),
            iterations: CFG.iterations,
            hash: 'SHA-256'
          },
          key,
          CFG.keyLen * 8
        );
      })
      .then(bytesToHex);
  }

  /* ---------------------------------------------------------
   * 4. 식별자 정규화
   * --------------------------------------------------------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function onlyDigits(v) { return String(v == null ? '' : v).replace(/[^0-9]/g, ''); }

  function isEmail(v) { return EMAIL_RE.test(String(v == null ? '' : v).trim()); }

  /** 휴대폰번호로 볼 수 있는가 (10~11자리 숫자, 01로 시작) */
  function isPhone(v) {
    var d = onlyDigits(v);
    return d.length >= 10 && d.length <= 11 && d.indexOf('01') === 0;
  }

  /** 010-0000-0000 형태로 포맷 */
  function formatPhone(v) {
    var d = onlyDigits(v).slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
    if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }

  /**
   * 로그인 식별자 정규화.
   * 이메일 → 소문자 trim / 휴대폰 → 숫자만
   * 서버도 동일 규칙으로 비교합니다.
   */
  function normalizeIdentifier(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    if (isEmail(s)) return s.toLowerCase();
    if (isPhone(s)) return onlyDigits(s);
    return s.toLowerCase();
  }

  function identifierType(v) {
    if (isEmail(v)) return 'email';
    if (isPhone(v)) return 'phone';
    return 'unknown';
  }

  /* ---------------------------------------------------------
   * 5. 비밀번호 정책 검증
   *    validatePassword(pw, {email, phone}) → {ok, level, messages}
   *    level : 0 사용불가 / 1 약함 / 2 보통 / 3 강함
   * --------------------------------------------------------- */
  function validatePassword(pw, ctx) {
    pw = String(pw == null ? '' : pw);
    ctx = ctx || {};
    var msgs = [];

    if (pw.length < 8 || pw.length > 20) msgs.push('8자 이상 20자 이하로 입력해 주세요.');

    var kinds = 0;
    if (/[A-Za-z]/.test(pw)) kinds++;
    if (/[0-9]/.test(pw)) kinds++;
    if (/[^A-Za-z0-9]/.test(pw)) kinds++;
    if (kinds < 2) msgs.push('영문·숫자·특수문자 중 2종 이상을 조합해 주세요.');

    if (/(.)\1\1/.test(pw)) msgs.push('같은 문자를 3번 연속 사용할 수 없습니다.');
    if (/\s/.test(pw)) msgs.push('공백은 사용할 수 없습니다.');
    if (hasSequential(pw, 4)) msgs.push('연속된 문자·숫자(abcd, 1234 등)는 사용할 수 없습니다.');

    var emailId = String(ctx.email || '').split('@')[0].toLowerCase();
    if (emailId.length >= 4 && pw.toLowerCase().indexOf(emailId) !== -1) {
      msgs.push('이메일 아이디를 비밀번호에 포함할 수 없습니다.');
    }
    var pd = onlyDigits(ctx.phone);
    if (pd.length >= 4 && pw.indexOf(pd.slice(-4)) !== -1) {
      msgs.push('휴대폰번호 뒷자리를 비밀번호에 포함할 수 없습니다.');
    }

    var ok = msgs.length === 0;
    var level = 0;
    if (ok) {
      level = 1;
      if (pw.length >= 10 && kinds >= 2) level = 2;
      if (pw.length >= 12 && kinds >= 3) level = 3;
    }
    return { ok: ok, level: level, messages: msgs };
  }

  /** 오름/내림 연속 문자열이 run 길이 이상 존재하는가 */
  function hasSequential(s, run) {
    var up = 1, down = 1;
    for (var i = 1; i < s.length; i++) {
      var d = s.charCodeAt(i) - s.charCodeAt(i - 1);
      up = d === 1 ? up + 1 : 1;
      down = d === -1 ? down + 1 : 1;
      if (up >= run || down >= run) return true;
    }
    return false;
  }

  function strengthLabel(level) {
    return ['사용 불가', '약함', '보통', '강함'][level] || '';
  }

  /* ---------------------------------------------------------
   * 6. API 통신
   *    Apps Script CORS 프리플라이트 회피를 위해 text/plain 으로 전송합니다.
   * --------------------------------------------------------- */
  function _request(body) {
    return fetch(CFG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('서버 통신에 실패했습니다. (HTTP ' + res.status + ')');
        return res.json();
      })
      .then(function (json) {
        if (!json || json.status !== 'ok') {
          var rawMsg = (json && json.message) || '요청 처리에 실패했습니다.';
          var code = json && json.code;
          /* 구버전 서버 감지 :
             v2 전용 액션(authChallenge / serverInfo 등)이 서버에 없으면
             '알 수 없는 요청입니다' 로 응답한다.
             원인이 '코드'가 아니라 '배포 미갱신'이라는 점을 화면에서 바로 알 수 있도록
             전용 코드와 안내 문구로 바꿔 던진다. */
          if (code === 'UNKNOWN_ACTION' || String(rawMsg).indexOf(UNKNOWN_ACTION_MSG) !== -1) {
            code = 'OUTDATED_SERVER';
            rawMsg = OUTDATED_MSG;
          }
          var err = new Error(rawMsg);
          err.code = code;
          throw err;
        }
        return json;
      });
  }

  /* ---------------------------------------------------------
   * 6-1. 서버 자가 진단 — 배포 버전 확인
   *      화면 진입 시 호출해 '구버전 배포' 상태를 즉시 알린다.
   *      → { ok, version, apiLevel, outdated, message, info }
   * --------------------------------------------------------- */
  function checkServer() {
    return _request({ action: 'serverInfo' })
      .then(function (json) {
        var level = Number(json.apiLevel || 0);
        var outdated = !(level >= EXPECTED_API_LEVEL);
        return {
          ok: !outdated,
          version: String(json.version || ''),
          apiLevel: level,
          outdated: outdated,
          message: outdated ? OUTDATED_MSG : '',
          info: json
        };
      })
      .catch(function (err) {
        /* serverInfo 액션 자체가 없는 구버전 서버 */
        if (err && err.code === 'OUTDATED_SERVER') {
          return { ok: false, version: '', apiLevel: 0, outdated: true, message: OUTDATED_MSG, info: null };
        }
        /* 네트워크 오류·권한 오류 등은 '구버전'으로 단정하지 않는다 */
        return {
          ok: false, version: '', apiLevel: 0, outdated: false,
          message: (err && err.message) || '서버 상태를 확인하지 못했습니다.',
          info: null
        };
      });
  }

  /** 토큰을 자동 첨부하는 공개 API 래퍼 */
  function api(action, payload) {
    var body = { action: action };
    if (payload) Object.keys(payload).forEach(function (k) { body[k] = payload[k]; });
    var t = getToken();
    if (t && body.token === undefined) body.token = t;
    return _request(body).catch(function (e) {
      if (e && e.code === 'UNAUTHORIZED') clearSession();
      throw e;
    });
  }

  /* ---------------------------------------------------------
   * 7. 세션
   * --------------------------------------------------------- */
  var _memory = { token: '', profile: null };

  function store() {
    try { return global.sessionStorage; } catch (e) { return null; }
  }

  function getToken() {
    var s = store();
    if (!s) return _memory.token || '';
    try { return s.getItem(CFG.tokenKey) || ''; } catch (e) { return _memory.token || ''; }
  }

  function setSession(token, profile) {
    _memory.token = token;
    _memory.profile = profile || null;
    var s = store();
    if (!s) return;
    try {
      s.setItem(CFG.tokenKey, token);
      if (profile) s.setItem(CFG.profileKey, JSON.stringify(profile));
    } catch (e) { /* 저장 불가 환경(프라이빗 모드 등)에서는 메모리로만 유지 */ }
  }

  function clearSession() {
    _memory.token = '';
    _memory.profile = null;
    /* 세션이 끊기면 활동내역 캐시(개인정보)도 함께 폐기한다. */
    clearAffiliateCache();
    var s = store();
    if (!s) return;
    try { s.removeItem(CFG.tokenKey); s.removeItem(CFG.profileKey); } catch (e) {}
  }

  function getProfile() {
    if (_memory.profile) return _memory.profile;
    var s = store();
    if (!s) return null;
    try { return JSON.parse(s.getItem(CFG.profileKey) || 'null'); } catch (e) { return null; }
  }

  /**
   * [v2.2] 세션에 보관 중인 프로필의 일부 필드만 갱신한다. (토큰은 그대로)
   *
   * 이메일을 바꾸면 회원ID(profile.id)가 바뀐다. 세션 프로필의 id 를 갱신하지 않으면
   * 활동내역 캐시 엔트리의 memberId 와 어긋나 화면 진입마다 캐시가 폐기된다.
   *
   * @param {Object} patch 병합할 필드 (예: { id: 'new@example.com', email: 'New@Example.com' })
   * @returns {Object|null} 갱신된 프로필
   */
  function updateSessionProfile(patch) {
    if (!patch || typeof patch !== 'object') return getProfile();
    var prof = getProfile() || {};
    var next = {};
    var k;
    for (k in prof) { if (Object.prototype.hasOwnProperty.call(prof, k)) next[k] = prof[k]; }
    for (k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k]; }
    _memory.profile = next;
    var s = store();
    if (s) {
      try { s.setItem(CFG.profileKey, JSON.stringify(next)); } catch (e) { /* 메모리로만 유지 */ }
    }
    return next;
  }

  function isAuthed() { return !!getToken(); }

  /* ---------------------------------------------------------
   * 7-1. 활동내역(userMe) 응답 캐시  — stale-while-revalidate 용
   *
   *  저장 형식 : { savedAt:<epoch ms>, memberId:<profile.id>, payload:<userMe 응답 원본> }
   *  저장 위치 : sessionStorage (불가 환경에서는 메모리 폴백)
   *
   *  ⚠️ 03_활동내역/js/data.js 와 04_로그인/js/login.js 가 이 헬퍼를 공유한다.
   *     키·형식을 양쪽에 중복 정의하지 말고 반드시 여기를 통해서만 읽고 쓴다.
   * --------------------------------------------------------- */
  /* sessionStorage 를 쓸 수 없는 환경(프라이빗 모드 등)에서의 폴백 */
  var _cacheFallback = null;

  /**
   * 서버가 붙여 주는 '계측 전용' 필드. (SPEC §3-1 — _ms = 서버 처리 ms, _cached = 캐시 히트 여부)
   * 매 호출마다 값이 달라지므로 캐시에 그대로 담으면 '데이터가 바뀌었다'는 오탐이 난다.
   *   → 불필요한 재렌더(깜빡임) + '최신 정보로 업데이트되었습니다' 토스트 오발
   * 캐시에 넣기 전에 반드시 제거한다.
   */
  var RESPONSE_META_FIELDS = ['_ms', '_cached'];

  /**
   * 응답에서 계측 전용 필드를 제거한 얕은 복사본을 만든다. (원본은 변경하지 않는다)
   * @param {Object} payload userMe 응답 원본
   * @returns {Object} 계측 필드가 제거된 payload
   */
  function stripResponseMeta(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    var out = {};
    for (var k in payload) {
      if (!Object.prototype.hasOwnProperty.call(payload, k)) continue;
      if (RESPONSE_META_FIELDS.indexOf(k) !== -1) continue;
      out[k] = payload[k];
    }
    return out;
  }

  /**
   * userMe 응답 원본을 캐시에 기록한다.
   * @param {Object} payload userMe 응답 원본 (가공 전)
   * @returns {Object|null} 저장된 캐시 엔트리
   */
  function writeAffiliateCache(payload) {
    if (!payload || typeof payload !== 'object') return null;
    var clean = stripResponseMeta(payload);
    var prof = clean.profile || null;
    var entry = {
      savedAt: Date.now(),
      memberId: prof && prof.id !== undefined && prof.id !== null ? String(prof.id) : '',
      payload: clean
    };
    _cacheFallback = entry;
    var s = store();
    if (s) {
      try { s.setItem(CFG.affiliateCacheKey, JSON.stringify(entry)); } catch (e) { /* 용량 초과 등 → 메모리로만 유지 */ }
    }
    return entry;
  }

  /**
   * 캐시 엔트리를 읽는다.
   * @returns {Object|null} { savedAt, memberId, payload } 또는 null
   */
  function readAffiliateCache() {
    var s = store();
    if (s) {
      try {
        var raw = s.getItem(CFG.affiliateCacheKey);
        if (raw) {
          var o = JSON.parse(raw);
          if (o && o.payload && typeof o.payload === 'object') {
            return { savedAt: Number(o.savedAt) || 0, memberId: String(o.memberId || ''), payload: o.payload };
          }
        }
      } catch (e) { /* 손상된 값은 무시하고 폴백을 사용 */ }
    }
    return _cacheFallback;
  }

  /** 캐시를 폐기한다. (로그아웃 / 탈퇴 / 계정 전환 / 세션 만료) */
  function clearAffiliateCache() {
    _cacheFallback = null;
    var s = store();
    if (!s) return;
    try { s.removeItem(CFG.affiliateCacheKey); } catch (e) {}
  }

  /** 미인증이면 로그인 페이지로 이동하고 false 반환 */
  function requireAuth() {
    if (isAuthed()) return true;
    var back = global.location.pathname.split('/').pop() + global.location.search;
    global.location.replace(CFG.loginUrl + '?next=' + encodeURIComponent(back));
    return false;
  }

  /* ---------------------------------------------------------
   * 8. 로그인 / 로그아웃 / 자격증명 생성
   * --------------------------------------------------------- */
  /**
   * 로그인.
   * 1) authChallenge 로 해당 계정의 클라이언트 salt 를 받아온다.
   *    (미존재 계정도 결정적 더미 salt 를 돌려주므로 계정 열거가 불가능하다)
   * 2) PBKDF2 로 clientHash 를 만든다.
   * 3) userLogin 으로 검증한다.
   */
  function login(identifier, password) {
    var id = normalizeIdentifier(identifier);
    if (!id) return Promise.reject(new Error('이메일 또는 휴대폰번호를 입력해 주세요.'));
    if (!password) return Promise.reject(new Error('비밀번호를 입력해 주세요.'));
    try { assertSecure(); } catch (e) { return Promise.reject(e); }

    return _request({ action: 'authChallenge', identifier: id })
      .then(function (r) { return derive(password, r.csalt); })
      .then(function (clientHash) {
        return _request({ action: 'userLogin', identifier: id, clientHash: clientHash });
      })
      .then(function (r) {
        setSession(r.token, r.profile);
        return r.profile;
      })
      .catch(function (err) {
        /* 실패 사유 코드(OUTDATED_SERVER / LOCKED / INACTIVE ...)를 그대로 화면까지 전달한다.
           특히 OUTDATED_SERVER 는 '비밀번호 오류'가 아니라 '서버 재배포 필요' 이므로
           로그인 화면이 다르게 안내해야 한다. */
        throw err;
      });
  }

  function logout(redirect) {
    var t = getToken();
    var done = function () {
      clearSession();
      if (redirect !== false) global.location.replace(CFG.loginUrl);
    };
    if (!t) { done(); return Promise.resolve(); }
    return _request({ action: 'userLogout', token: t }).then(done, done);
  }

  /**
   * 가입·비밀번호 변경용 자격 증명 생성.
   * → Promise<{ csalt, clientHash }>  (평문 비밀번호는 반환하지 않음)
   */
  function makeCredential(password) {
    var csalt;
    try { csalt = randomSaltHex(16); } catch (e) { return Promise.reject(e); }
    return derive(password, csalt).then(function (h) {
      return { csalt: csalt, clientHash: h };
    });
  }

  /* ---------------------------------------------------------
   * 9. 노출
   * --------------------------------------------------------- */
  global.LFAuth = {
    config: config,
    isSecureContextOk: isSecureContextOk,
    INSECURE_MSG: INSECURE_MSG,

    /* 서버 배포 버전 자가 진단 */
    EXPECTED_API_LEVEL: EXPECTED_API_LEVEL,
    OUTDATED_MSG: OUTDATED_MSG,
    checkServer: checkServer,

    randomSaltHex: randomSaltHex,
    derive: derive,
    makeCredential: makeCredential,

    isEmail: isEmail,
    isPhone: isPhone,
    onlyDigits: onlyDigits,
    formatPhone: formatPhone,
    normalizeIdentifier: normalizeIdentifier,
    identifierType: identifierType,

    validatePassword: validatePassword,
    strengthLabel: strengthLabel,

    api: api,
    request: _request,

    login: login,
    logout: logout,
    getToken: getToken,
    getProfile: getProfile,
    setSession: setSession,
    updateSessionProfile: updateSessionProfile,
    clearSession: clearSession,
    isAuthed: isAuthed,
    requireAuth: requireAuth,

    /* 활동내역 캐시 (data.js / login.js 공용) */
    CACHE_KEY: CFG.affiliateCacheKey,
    stripResponseMeta: stripResponseMeta,
    writeAffiliateCache: writeAffiliateCache,
    readAffiliateCache: readAffiliateCache,
    clearAffiliateCache: clearAffiliateCache
  };
})(window);
