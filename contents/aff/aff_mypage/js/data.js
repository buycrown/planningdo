/**
 * data.js  (v2.0)
 * 어필리에이트 활동내역 데이터 스토어.
 *
 * v1.x 의 더미 SEED 와 localStorage 기반 상태 저장은 전면 제거되었습니다.
 * 서버(Apps Script)가 유일한 진실의 원천이며, 화면은 아래 계약만 사용합니다.
 *
 *   AffiliateStore.load(force)       -> Promise<data>  'userMe' 1회 호출 후 캐시
 *                                       (중복 호출 시 동일 Promise 반환)
 *   AffiliateStore.getCached()       -> data | null     (동기) 영속 캐시 즉시 반환
 *   AffiliateStore.refresh()         -> Promise<data>   백그라운드 갱신 (실패해도 reject 안 함)
 *   AffiliateStore.onUpdate(fn)      -> unsubscribe     데이터가 '실제로 바뀌었을 때만' 콜백
 *   AffiliateStore.onRefreshError(fn)-> unsubscribe     백그라운드 갱신 실패 통보
 *   AffiliateStore.clearCache()      -> 캐시 전체 폐기
 *   AffiliateStore.get()             -> { profile, links, revenue, summary }
 *   AffiliateStore.totalRevenue() / currentMonth() / momDelta() / avgRevenue()
 *   AffiliateStore.linkCount() / activeLinkCount() / bestMonth() / maxMonthAmount()
 *   AffiliateStore.updateContact(patch)   -> 'userUpdateContact'
 *   AffiliateStore.withdraw(reason, etc)  -> 'userWithdraw'
 *
 * 서버 응답 스키마는 공용_서버_문서/SPEC.md §3-1 을 따릅니다.
 * ES5 호환 문법(var, 함수 선언식)만 사용합니다.
 *
 * [캐시 설계 — stale-while-revalidate]
 *   03_활동내역은 6개 HTML 문서로 분리돼 있어 페이지를 이동할 때마다 문서가 새로 로드되고
 *   메모리 캐시(_promise)가 사라진다. 그 결과 이동할 때마다 userMe 를 다시 호출해
 *   Apps Script 왕복(2~4초) 동안 스켈레톤이 노출됐다.
 *
 *   → userMe 응답 '원본'을 sessionStorage(LFAuth.CACHE_KEY)에 보관한다.
 *     · 재진입 시 getCached() 로 즉시 렌더 (스켈레톤 0초)
 *     · 동시에 refresh() 로 항상 백그라운드 갱신 (TTL 로 갱신을 건너뛰지 않는다)
 *     · 갱신 결과를 이전 payload 와 JSON 직렬화 비교해 '실제로 바뀐 경우에만' onUpdate 통보
 *       (동일한데 재렌더하면 화면이 깜빡인다)
 *     · 캐시의 memberId 가 현재 세션 프로필 id 와 다르면 즉시 폐기 (계정 전환 방어)
 *     · localStorage 는 쓰지 않는다. 탭을 닫으면 개인정보도 함께 사라져야 한다.
 */
(function (global) {
  'use strict';

  var EMPTY = { profile: null, links: [], revenue: [], summary: null };

  var _promise = null;      /* 진행 중이거나 완료된 load() Promise */
  var _data = null;         /* 정규화된 메모리 캐시 */
  var _raw = null;          /* 마지막으로 반영한 userMe 응답 '원본' (변경 감지 기준) */
  var _refreshing = null;   /* 진행 중인 refresh() Promise (중복 요청 방지) */
  var _updateFns = [];      /* onUpdate 구독자 */
  var _errorFns = [];       /* onRefreshError 구독자 */

  /* ------------------------------------------------------------------
     1. 정규화 유틸
     ------------------------------------------------------------------ */
  function num(v, dflt) {
    if (v === null || v === undefined || v === '') return dflt;
    var n = Number(v);
    return isFinite(n) ? n : dflt;
  }

  function str(v) { return v === null || v === undefined ? '' : String(v); }

  function arr(v) { return Object.prototype.toString.call(v) === '[object Array]' ? v : []; }

  /** 서버(buildProfile)와 동일한 휴대폰 마스킹 규칙 : 01012345678 -> 010-****-5678 */
  function maskPhone(v) {
    var d = str(v).replace(/[^0-9]/g, '');
    if (d.length < 8) return str(v);
    return d.slice(0, 3) + '-****-' + d.slice(-4);
  }

  function todayStr() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /** 서버가 status 를 주지 않은 경우의 폴백 계산 (SPEC §1-2 규칙과 동일) */
  function calcStatus(startAt, endAt) {
    var today = todayStr();
    if (startAt && today < startAt) return 'scheduled';
    if (endAt && today > endAt) return 'closed';
    return 'active';
  }

  function normStatus(v, startAt, endAt) {
    var s = str(v).toLowerCase();
    if (s === 'active' || s === 'scheduled' || s === 'closed') return s;
    return calcStatus(startAt, endAt);
  }

  function normChannel(c) {
    if (!c) return null;
    return {
      type: str(c.type),
      label: str(c.label) || str(c.type) || '채널',
      handle: str(c.handle),
      url: str(c.url),
      primary: !!c.primary
    };
  }

  /* ------------------------------------------------------------------
     1-1. SNS 유형 (v2.1)
     신청내역 21~26열(대표채널 / Instagram / YouTube / X / TikTok / 기타) 분리에 대응한다.
     서버는 profile 에 primaryChannelType · snsByType 을 '추가'만 했으므로
     두 필드가 없는 구 스키마 캐시에서도 channels[] 로 동일하게 그려져야 한다.
     ------------------------------------------------------------------ */
  var SNS_FIXED = { instagram: 1, youtube: 1, x: 1, tiktok: 1 };
  /* 서버·시트에서 온 유형 문자열을 그대로 객체 키로 쓰지 않는다.
     'constructor' / 'toString' / '__proto__' 같은 값이 오면 상속 프로퍼티가 걸려
     엉뚱한 그룹이 생기거나(진짜 값이 truthy) 대입이 조용히 무시된다.
     (02_ADMIN/admin.js 의 hasKey() 와 같은 규칙) */
  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  /* 외부 문자열을 키로 쓰는 사전은 프로토타입이 없는 객체로 만든다 */
  function dict() { return Object.create(null); }
  var SNS_TYPE_ORDER = ['instagram', 'youtube', 'x', 'tiktok', 'etc'];
  var SNS_TYPE_LABEL = {
    instagram: 'Instagram', youtube: 'YouTube', x: 'X (Twitter)',
    tiktok: 'TikTok', etc: '기타 채널'
  };

  /** 유형 문자열 정규화 : 'X (Twitter)' / 'twitter' -> 'x', '유튜브' -> 'youtube' */
  function normType(t) {
    var k = str(t).toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
    if (!k) return '';
    if (k.indexOf('instagram') === 0 || k === 'ig' || k === '인스타그램') return 'instagram';
    if (k.indexOf('youtube') === 0 || k === 'yt' || k === '유튜브') return 'youtube';
    if (k.indexOf('tiktok') === 0 || k === '틱톡') return 'tiktok';
    if (k === 'x' || k === 'xtwitter' || k.indexOf('twitter') !== -1 || k === '엑스') return 'x';
    return k;   /* blog / cafe / etc … : 표시 단계에서 '기타'로 묶는다 */
  }

  /** 화면 그룹 키 : 고정 4종이 아니면 전부 '기타' */
  function groupKey(t) {
    var k = normType(t);
    return own(SNS_FIXED, k) ? k : 'etc';
  }

  function typeLabel(t) {
    var k = groupKey(t);
    return own(SNS_TYPE_LABEL, k) ? SNS_TYPE_LABEL[k] : '기타 채널';
  }

  /** 배열이 아닌 값도 받아 준다 (서버가 단일 문자열을 준 경우 방어) */
  function listOf(v) {
    if (Object.prototype.toString.call(v) === '[object Array]') return v;
    if (v === null || v === undefined || v === '') return [];
    return [v];
  }

  /** 'https://www.instagram.com/daily_bunny' -> '@daily_bunny' (못 뽑으면 '') */
  function handleFromUrl(u) {
    var s = str(u).replace(/^https?:\/\//i, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
    var parts = s.split('/');
    if (parts.length < 2) return '';
    var last = str(parts[parts.length - 1]);
    if (!last) return '';
    return last.charAt(0) === '@' ? last : '@' + last;
  }

  /** 화면에 곁들여 보여줄 짧은 주소 (프로토콜 제거) */
  function displayUrl(u) {
    return str(u).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }

  /**
   * profile.snsByType 정규화.
   * { instagram:[url…], …, etc:[{channel,url}] } 형태를 그대로 보존하되
   * 문자열/객체를 모두 { url, channel } 로 통일한다.
   * @returns {Object|null} 유효한 항목이 하나도 없으면 null (→ 화면은 channels[] 로 폴백)
   */
  function normSnsByType(v) {
    if (!v || typeof v !== 'object' || Object.prototype.toString.call(v) === '[object Array]') return null;
    var out = dict();
    var total = 0;
    Object.keys(v).forEach(function (rawKey) {
      var bucket = [];
      listOf(v[rawKey]).forEach(function (it) {
        var url, channel;
        if (it && typeof it === 'object') { url = str(it.url); channel = str(it.channel); }
        else { url = str(it); channel = ''; }
        url = url.replace(/^\s+/, '').replace(/\s+$/, '');
        if (!url) return;
        bucket.push({ url: url, channel: channel });
        total++;
      });
      if (bucket.length) out[str(rawKey)] = bucket;
    });
    return total ? out : null;
  }

  /**
   * 유형별 채널 그룹을 만든다.
   *   정렬 : 대표채널 유형 -> Instagram -> YouTube -> X -> TikTok -> 기타 (SPEC §1-1)
   *   출처 : profile.snsByType 우선, 없으면 profile.channels[] 폴백 (구 스키마 캐시 호환)
   * @returns {Array} [{ type, label, primary, items:[{url,name,desc,label,primary}] }]
   */
  function buildChannelGroups(profile) {
    if (!profile) return [];
    var channels = arr(profile.channels);

    /* channels[] 에 있는 핸들·라벨을 URL 로 되찾기 위한 색인 */
    var byUrl = dict();
    channels.forEach(function (c) { if (c && c.url) byUrl[c.url] = c; });

    var buckets = dict();
    var seen = dict();
    var order = [];

    function push(key, item) {
      if (!item.url) return;
      if (seen[item.url]) return;          /* 같은 URL 이 두 경로로 들어와도 한 번만 */
      seen[item.url] = true;
      if (!buckets[key]) { buckets[key] = []; order.push(key); }
      buckets[key].push(item);
    }

    var byType = profile.snsByType;
    if (byType) {
      Object.keys(byType).forEach(function (rawKey) {
        listOf(byType[rawKey]).forEach(function (it) {
          var url = str(it && it.url);
          var known = byUrl[url];
          var name = (known && known.handle) || str(it && it.channel) || handleFromUrl(url) || displayUrl(url);
          push(groupKey(rawKey), {
            url: url,
            name: name,
            desc: displayUrl(url),
            label: (known && known.label) || str(it && it.channel) || typeLabel(rawKey),
            primary: false
          });
        });
      });
    } else {
      /* v2.1 이전 캐시 / snsByType 미제공 : channels[] 를 유형별로 묶는다 */
      channels.forEach(function (c) {
        if (!c) return;
        push(groupKey(c.type), {
          url: str(c.url),
          name: str(c.handle) || handleFromUrl(c.url) || str(c.label),
          desc: displayUrl(c.url),
          label: str(c.label) || typeLabel(c.type),
          primary: false
        });
      });
    }

    /* 대표 유형 결정 : primaryChannelType -> primaryChannel.type -> 첫 그룹 */
    var primaryUrl = (profile.primaryChannel && str(profile.primaryChannel.url)) || '';
    var primaryType = profile.primaryChannelType
      ? groupKey(profile.primaryChannelType)
      : (profile.primaryChannel ? groupKey(profile.primaryChannel.type) : '');
    if (!buckets[primaryType]) primaryType = order.length ? order[0] : '';

    var groups = order.map(function (key) {
      var items = buckets[key];
      /* 대표 그룹 안에서는 대표 URL 항목(없으면 첫 항목)을 대표로 표시한다 */
      if (key === primaryType) {
        var idx = -1;
        for (var i = 0; i < items.length; i++) {
          if (primaryUrl && items[i].url === primaryUrl) { idx = i; break; }
        }
        if (idx === -1) idx = 0;
        items[idx].primary = true;
      }
      return {
        type: key,
        label: own(SNS_TYPE_LABEL, key) ? SNS_TYPE_LABEL[key] : '기타 채널',
        primary: key === primaryType,
        items: items
      };
    });

    /* 대표 그룹을 맨 앞으로, 나머지는 고정 순서(SPEC §1-1)대로 */
    groups.sort(function (a, b) {
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      var ia = SNS_TYPE_ORDER.indexOf(a.type);
      var ib = SNS_TYPE_ORDER.indexOf(b.type);
      if (ia === -1) ia = SNS_TYPE_ORDER.length;
      if (ib === -1) ib = SNS_TYPE_ORDER.length;
      return ia - ib;
    });

    return groups;
  }

  function normLink(l) {
    if (!l) return null;
    var startAt = str(l.startAt) || str(l.issuedAt);
    var endAt = str(l.endAt);
    return {
      id: str(l.id),
      name: str(l.name),
      url: str(l.url),
      issuedAt: str(l.issuedAt),
      startAt: startAt,
      endAt: endAt,
      status: normStatus(l.status, startAt, endAt)
    };
  }

  function normRevenue(r) {
    if (!r) return null;
    var ym = str(r.ym);
    var label = str(r.label);
    if (!label && /^(\d{4})-(\d{2})$/.test(ym)) {
      label = Number(ym.slice(0, 4)) + '년 ' + Number(ym.slice(5, 7)) + '월';
    }
    return { ym: ym, label: label || ym, amount: num(r.amount, 0) };
  }

  /** userMe 응답 → 화면이 사용하는 형태로 정규화 */
  function normalize(res) {
    var p = (res && res.profile) || {};
    var s = (res && res.summary) || {};

    var channels = [];
    arr(p.channels).forEach(function (c) {
      var n = normChannel(c);
      if (n) channels.push(n);
    });

    var links = [];
    arr(res && res.links).forEach(function (l) {
      var n = normLink(l);
      if (n) links.push(n);
    });

    var revenue = [];
    arr(res && res.revenue).forEach(function (r) {
      var n = normRevenue(r);
      if (n) revenue.push(n);
    });

    var primaryChannel = normChannel(p.primaryChannel) || channels[0] || null;

    var profile = {
      id: str(p.id),
      nickname: str(p.nickname),
      name: str(p.name),
      email: str(p.email),
      phone: str(p.phone),
      categories: arr(p.categories).map(str),
      bizStatus: str(p.bizStatus),
      channels: channels,
      primaryChannel: primaryChannel,
      /* --- v2.1 신규 필드 : 화이트리스트에 추가해 '보존'한다 ---------------
         구 스키마 캐시(두 필드 없음)로 들어와도 화면이 깨지지 않도록
         primaryChannelType 은 대표 채널의 유형으로 폴백하고,
         snsByType 은 null 로 두어 화면이 channels[] 로 폴백하게 한다. */
      primaryChannelType: normType(p.primaryChannelType) ||
                          (primaryChannel ? normType(primaryChannel.type) : ''),
      snsByType: normSnsByType(p.snsByType),
      joinedAt: str(p.joinedAt),
      activeMonths: num(p.activeMonths, 0),
      commissionRate: num(p.commissionRate, null),
      status: str(p.status)
    };

    profile.channelGroups = buildChannelGroups(profile);

    var sumRevenue = revenue.reduce(function (acc, r) { return acc + r.amount; }, 0);
    var activeCount = links.filter(function (l) { return l.status === 'active'; }).length;

    var summary = {
      totalRevenue: num(s.totalRevenue, sumRevenue),
      linkCount: num(s.linkCount, links.length),
      activeLinkCount: num(s.activeLinkCount, activeCount),
      activeMonths: num(s.activeMonths, profile.activeMonths),
      commissionRate: s.commissionRate === undefined ? profile.commissionRate : num(s.commissionRate, null)
    };

    return { profile: profile, links: links, revenue: revenue, summary: summary };
  }

  /* ------------------------------------------------------------------
     1-2. 영속 캐시 계층 (sessionStorage)
     ------------------------------------------------------------------ */
  function auth() { return global.LFAuth || null; }

  /** 현재 로그인 세션의 회원 id (알 수 없으면 '') */
  function sessionMemberId() {
    var a = auth();
    if (!a || typeof a.getProfile !== 'function') return '';
    var p = null;
    try { p = a.getProfile(); } catch (e) { p = null; }
    return p && p.id !== undefined && p.id !== null ? String(p.id) : '';
  }

  /** 캐시 저장 (실패는 무시 — 캐시는 있으면 좋은 것이지 필수가 아니다) */
  function cacheWrite(payload) {
    var a = auth();
    if (!a || typeof a.writeAffiliateCache !== 'function') return;
    try { a.writeAffiliateCache(payload); } catch (e) {}
  }

  /** 캐시 삭제 */
  function cacheDrop() {
    var a = auth();
    if (!a || typeof a.clearAffiliateCache !== 'function') return;
    try { a.clearAffiliateCache(); } catch (e) {}
  }

  /**
   * 캐시 엔트리를 읽고 유효성을 검사한다.
   * 캐시의 memberId 와 현재 세션 프로필 id 가 다르면(계정 전환) 즉시 폐기한다.
   * @returns {Object|null} { savedAt, memberId, payload }
   */
  function cacheRead() {
    var a = auth();
    if (!a || typeof a.readAffiliateCache !== 'function') return null;
    var entry = null;
    try { entry = a.readAffiliateCache(); } catch (e) { entry = null; }
    if (!entry || !entry.payload) return null;

    /* 세션 불일치 방어 : 남의 계정 데이터가 보이면 안 된다. */
    var mine = sessionMemberId();
    if (mine && entry.memberId && entry.memberId !== mine) {
      cacheDrop();
      return null;
    }
    return entry;
  }

  /**
   * 서버가 붙이는 계측 필드(_ms/_cached)를 제거한다.
   * 이 값들은 호출할 때마다 달라지므로 그대로 비교하면 '항상 변경됨'이 되어
   * 재진입마다 전체 재렌더 + '최신 정보로 업데이트되었습니다' 토스트가 오발한다.
   * 규칙은 LFAuth.stripResponseMeta 가 단독으로 소유한다. (캐시 형식과 동일한 원칙)
   */
  function stripMeta(payload) {
    var a = auth();
    if (a && typeof a.stripResponseMeta === 'function') {
      try { return a.stripResponseMeta(payload); } catch (e) { /* 아래 폴백 */ }
    }
    if (!payload || typeof payload !== 'object') return payload;
    var out = {};
    for (var k in payload) {
      if (!Object.prototype.hasOwnProperty.call(payload, k)) continue;
      if (k === '_ms' || k === '_cached') continue;
      out[k] = payload[k];
    }
    return out;
  }

  /** 두 payload 가 사실상 동일한가 (JSON 직렬화 비교) */
  function samePayload(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    var sa, sb;
    try { sa = JSON.stringify(a); sb = JSON.stringify(b); } catch (e) { return false; }
    return sa === sb;
  }

  /**
   * 새 payload 를 스토어에 반영한다.
   * @returns {Boolean} 이전 payload 와 달라서 화면을 다시 그려야 하는가
   */
  function adopt(payload) {
    /* 계측 필드를 먼저 걷어낸 뒤 비교·저장한다. (변경 감지 오탐 방지) */
    var clean = stripMeta(payload);
    var changed = !samePayload(_raw, clean);
    _raw = clean;
    _data = normalize(clean);
    cacheWrite(clean);
    return changed;
  }

  function emitUpdate(data) {
    /* 구독자 한 명이 던진 예외가 나머지 구독자를 막지 않게 한다. */
    _updateFns.slice().forEach(function (fn) {
      try { fn(data); } catch (e) { if (global.console) global.console.error(e); }
    });
  }

  function emitError(err) {
    _errorFns.slice().forEach(function (fn) {
      try { fn(err); } catch (e) { if (global.console) global.console.error(e); }
    });
  }

  function noAuthError() {
    return new Error('인증 모듈(auth.js)이 로드되지 않았습니다.');
  }

  function callUserMe() {
    var a = auth();
    if (!a || typeof a.api !== 'function') return Promise.reject(noAuthError());
    return a.api('userMe');
  }

  /* ------------------------------------------------------------------
     2. 스토어
     ------------------------------------------------------------------ */
  var Store = {
    /**
     * 'userMe' 를 1회 호출하고 메모리에 캐시한다.
     * 중복 호출 시 동일한 Promise 를 반환하며, 실패 시 캐시를 비워 재시도가 가능하다.
     * @param {Boolean} force true 면 캐시를 무시하고 다시 조회
     */
    load: function (force) {
      if (force) { _promise = null; _data = null; }
      if (_promise) return _promise;

      _promise = callUserMe().then(function (res) {
        adopt(res);
        return _data;
      }, function (err) {
        _promise = null;   /* 재시도 가능하도록 캐시 해제 */
        _data = null;
        if (err && err.code === 'UNAUTHORIZED') Store.clearCache();
        throw err;
      });

      return _promise;
    },

    /**
     * 저장된 캐시를 '동기'로 즉시 반환한다. (네트워크 대기 없음)
     * 세션이 바뀐 캐시는 폐기하고 null 을 반환한다.
     * @returns {Object|null} 정규화된 data 또는 null
     */
    getCached: function () {
      if (_data) return _data;
      var entry = cacheRead();
      if (!entry) return null;
      _raw = entry.payload;
      _data = normalize(entry.payload);
      return _data;
    },

    /**
     * 백그라운드 갱신.
     * - 항상 서버를 다시 조회한다. (TTL 로 건너뛰지 않는다)
     * - 응답이 이전 payload 와 다를 때만 onUpdate 구독자에게 통보한다.
     * - 실패해도 reject 하지 않는다. 캐시로 그려진 화면을 에러로 덮으면 안 되기 때문이다.
     *   실패 사유는 onRefreshError 로 전달한다.
     * @returns {Promise<Object|null>} 최신(또는 기존) data
     */
    refresh: function () {
      if (_refreshing) return _refreshing;

      _refreshing = callUserMe().then(function (res) {
        _refreshing = null;
        var changed = adopt(res);
        /* 이후 load() 가 네트워크를 다시 타지 않도록 완료 Promise 를 교체해 둔다. */
        _promise = Promise.resolve(_data);
        if (changed) emitUpdate(_data);
        return _data;
      }, function (err) {
        _refreshing = null;
        /* 세션 만료 : 캐시(개인정보)를 즉시 폐기한다. 화면 전환은 구독자가 담당한다. */
        if (err && err.code === 'UNAUTHORIZED') Store.clearCache();
        emitError(err);
        return _data;   /* 예외를 전파하지 않는다 → 캐시로 렌더된 화면 유지 */
      });

      return _refreshing;
    },

    /**
     * 갱신으로 데이터가 '실제로 바뀌었을 때만' 호출되는 콜백을 등록한다.
     * @returns {Function} 구독 해제 함수
     */
    onUpdate: function (fn) {
      if (typeof fn !== 'function') return function () {};
      _updateFns.push(fn);
      return function () {
        for (var i = 0; i < _updateFns.length; i++) {
          if (_updateFns[i] === fn) { _updateFns.splice(i, 1); return; }
        }
      };
    },

    /**
     * 백그라운드 갱신 실패 통보. (UNAUTHORIZED 처리 등)
     * @returns {Function} 구독 해제 함수
     */
    onRefreshError: function (fn) {
      if (typeof fn !== 'function') return function () {};
      _errorFns.push(fn);
      return function () {
        for (var i = 0; i < _errorFns.length; i++) {
          if (_errorFns[i] === fn) { _errorFns.splice(i, 1); return; }
        }
      };
    },

    /** 캐시(영속 + 메모리)를 전부 폐기한다. */
    clearCache: function () {
      _promise = null;
      _data = null;
      _raw = null;
      _refreshing = null;
      cacheDrop();
    },

    /** 캐시 강제 갱신 */
    reload: function () { return Store.load(true); },

    isLoaded: function () { return !!_data; },

    /** load() 완료 후에만 유효 */
    get: function () { return _data || EMPTY; },

    profile: function () { return (_data && _data.profile) || null; },
    links: function () { return (_data && _data.links) || []; },
    revenueList: function () { return (_data && _data.revenue) || []; },
    summary: function () { return (_data && _data.summary) || null; },

    /* ---- 파생 값 ---------------------------------------------------- */

    /** 총 수익 (summary.totalRevenue) */
    totalRevenue: function () {
      var s = Store.summary();
      if (s && isFinite(s.totalRevenue)) return s.totalRevenue;
      return Store.revenueList().reduce(function (acc, r) { return acc + r.amount; }, 0);
    },

    /** 최신 월 수익 (없으면 null) */
    currentMonth: function () {
      var list = Store.revenueList();
      return list.length ? list[0] : null;
    },

    /** 전월 대비 증감액 */
    momDelta: function () {
      var list = Store.revenueList();
      if (list.length < 2) return 0;
      return list[0].amount - list[1].amount;
    },

    /** 월 평균 수익 */
    avgRevenue: function () {
      var list = Store.revenueList();
      return list.length ? Math.round(Store.totalRevenue() / list.length) : 0;
    },

    /** 전체 링크 수 */
    linkCount: function () {
      var s = Store.summary();
      if (s && isFinite(s.linkCount)) return s.linkCount;
      return Store.links().length;
    },

    /** 활성 링크 수 */
    activeLinkCount: function () {
      var s = Store.summary();
      if (s && isFinite(s.activeLinkCount)) return s.activeLinkCount;
      return Store.countByStatus('active');
    },

    countByStatus: function (status) {
      return Store.links().filter(function (l) { return l.status === status; }).length;
    },

    /** 최고 수익 월 (없으면 null) */
    bestMonth: function () {
      var list = Store.revenueList();
      if (!list.length) return null;
      return list.reduce(function (a, b) { return b.amount > a.amount ? b : a; }, list[0]);
    },

    /** 월별 최대 금액 (막대 그래프 기준값) */
    maxMonthAmount: function () {
      return Store.revenueList().reduce(function (m, r) { return Math.max(m, r.amount); }, 0);
    },

    /** 활동 기간 (개월) */
    activeMonths: function () {
      var s = Store.summary();
      if (s && isFinite(s.activeMonths)) return s.activeMonths;
      var p = Store.profile();
      return p ? p.activeMonths : 0;
    },

    /** 대표 채널 (없으면 null) */
    primaryChannel: function () {
      var p = Store.profile();
      return p ? p.primaryChannel : null;
    },

    /** 대표 채널 유형 ('instagram' 등). 서버가 주지 않으면 대표 채널에서 유추, 그것도 없으면 '' */
    primaryChannelType: function () {
      var p = Store.profile();
      return p ? str(p.primaryChannelType) : '';
    },

    /**
     * 유형별 채널 그룹 (대표채널 -> Instagram -> YouTube -> X -> TikTok -> 기타).
     * snsByType 우선 · 없으면 channels[] 폴백 → 구 스키마 캐시에서도 동일하게 동작한다.
     */
    channelGroups: function () {
      var p = Store.profile();
      if (!p) return [];
      return p.channelGroups || buildChannelGroups(p);
    },

    /** 전체 채널 개수 (그룹 내 항목 합계) */
    channelCount: function () {
      return Store.channelGroups().reduce(function (n, g) { return n + g.items.length; }, 0);
    },

    /** 수수료율 표시 문자열 : 5 -> '5%', null -> '미설정' */
    commissionLabel: function () {
      var s = Store.summary();
      var rate = s ? s.commissionRate : null;
      if (rate === null || rate === undefined || !isFinite(rate)) return '미설정';
      return (Math.round(rate * 100) / 100) + '%';
    },

    hasCommission: function () {
      var s = Store.summary();
      return !!(s && s.commissionRate !== null && s.commissionRate !== undefined && isFinite(s.commissionRate));
    },

    /* ---- 변경 API ---------------------------------------------------- */

    /**
     * 연락처(이메일 / 휴대폰) 수정.
     * @param {Object} patch {email?, phone?}
     * @returns {Promise<Object>} 갱신된 profile
     */
    updateContact: function (patch) {
      patch = patch || {};
      var body = {};
      /* 빈 값은 서버가 무시하므로 전송하지 않는다. (캐시가 빈 값으로 덮어써지는 것도 방지) */
      if (patch.email !== undefined && String(patch.email).trim()) body.email = String(patch.email).trim();
      if (patch.phone !== undefined && String(patch.phone).trim()) body.phone = String(patch.phone).trim();

      if (!body.email && !body.phone) {
        return Promise.reject(new Error('변경할 정보를 입력해 주세요.'));
      }

      return global.LFAuth.api('userUpdateContact', body).then(function () {
        if (_data && _data.profile) {
          if (body.email) _data.profile.email = body.email;
          /* 서버는 마스킹된 값을 내려주므로 화면 캐시도 동일한 규칙으로 마스킹해 둔다. */
          if (body.phone) _data.profile.phone = maskPhone(body.phone);
        }
        /*
         * 저장된 캐시는 이 시점부터 낡은 값(이전 연락처)이므로 즉시 폐기한다.
         * 화면이 방금 그린 내용을 잃지 않도록 메모리 상태(_data)는 남겨 두고,
         * _raw 만 비워 다음 refresh() 가 서버 값을 '변경'으로 인식해 다시 그리게 한다.
         */
        cacheDrop();
        _raw = null;
        return Store.profile();
      });
    },

    /**
     * 서비스 탈퇴.
     * @param {String} reason 선택한 사유
     * @param {String} etc    기타 상세 사유
     */
    withdraw: function (reason, etc) {
      return global.LFAuth.api('userWithdraw', {
        reason: String(reason == null ? '' : reason),
        etc: String(etc == null ? '' : etc)
      }).then(function (res) {
        /* 탈퇴 성공 : 개인정보가 남지 않도록 영속 캐시까지 전부 폐기한다. */
        Store.clearCache();
        return res;
      });
    }
  };

  global.AffiliateStore = Store;
})(window);
