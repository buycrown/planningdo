/**
 * data.js
 * 시연용 더미 데이터 + 상태 저장소.
 *
 * [실서비스 연동 시 교체 지점]
 *  - AffiliateStore.get()      -> GET  /api/mypage/affiliate/summary
 *  - AffiliateStore.creator    -> GET  /api/mypage/affiliate/creator
 *  - AffiliateStore.withdraw() -> POST /api/mypage/affiliate/withdraw
 * 현재는 localStorage 로만 상태를 유지합니다. (탈퇴 -> 마이페이지 메뉴 미노출 시연용)
 */
(function (global) {
  'use strict';

  var KEY = 'lfmall_affiliate_demo_v1';

  /* ------------------------------------------------------------------
     1. 기준 더미 데이터
     ------------------------------------------------------------------ */
  var SEED = {
    /* 어필리에이트 서비스 가입(승인) 여부. false 이면 마이페이지 메뉴 미노출 */
    joined: true,

    member: {
      lfmallId: 'buycrown',
      name: '최*석',
      grade: 'Gold'
    },

    /* 가입 신청 시 입력한 정보 (buycrown.cloud/contents/aff_join 신청 양식 기준) */
    creator: {
      nickname: '데일리버니',
      email: 'jagallang@gmail.com',
      phone: '010-****-1234',
      bizType: '사업자 없음',
      categories: ['여성패션', '뷰티', '리빙·라이프스타일'],
      channels: [
        { type: 'instagram', label: 'Instagram', handle: '@daily_bunny',       followers: 48200 },
        { type: 'youtube',   label: 'YouTube',   handle: '데일리버니 TV',       followers: 12700 },
        { type: 'tiktok',    label: 'TikTok',    handle: '@dailybunny_official', followers: 8300 }
      ],
      attachments: ['신분증_사본.jpg'],
      status: '승인 완료',
      appliedAt: '2026-01-18',
      approvedAt: '2026-01-22',
      /* 정산 조건 */
      commissionRate: '5%',
      settleCycle: '익월 15일 지급',
      settleBase: '구매 확정 금액(부가세 별도) 기준'
    },

    /* 가입 시 동의한 약관 */
    agreement: {
      terms:  { title: '서비스 이용약관', version: 'v1.0', agreedAt: '2026-01-18 14:32' },
      policy: { title: '서비스 운영정책', version: 'v1.0', agreedAt: '2026-01-18 14:32' }
    },

    /* 월별 수익 (최신순)
       ※ 클릭수·구매전환수는 현 시점 제공 불가 데이터로 화면에서 제외 */
    revenue: [
      { ym: '2026-07', label: '2026년 7월', amount: 612400 },
      { ym: '2026-06', label: '2026년 6월', amount: 538900 },
      { ym: '2026-05', label: '2026년 5월', amount: 471200 },
      { ym: '2026-04', label: '2026년 4월', amount: 402700 },
      { ym: '2026-03', label: '2026년 3월', amount: 448300 },
      { ym: '2026-02', label: '2026년 2월', amount: 374100 }
    ],

    /* LF 실무자가 지급한 어필리에이트 링크 내역 (최신순)
       status : 'active' 활성 / 'closed' 종료(기획전 종료·품절 등) */
    links: [
      { id: 'L2607-014', url: 'https://slink.im/4z37UeG', issuedAt: '2026-07-28', status: 'active' },
      { id: 'L2607-011', url: 'https://slink.im/9Kd2Wq1', issuedAt: '2026-07-21', status: 'active' },
      { id: 'L2607-006', url: 'https://slink.im/Bn5xR7t', issuedAt: '2026-07-09', status: 'active' },
      { id: 'L2606-023', url: 'https://slink.im/Tq8mZ3c', issuedAt: '2026-06-25', status: 'active' },
      { id: 'L2606-017', url: 'https://slink.im/Vh1sD6p', issuedAt: '2026-06-12', status: 'closed' },
      { id: 'L2605-009', url: 'https://slink.im/Xw4nL8b', issuedAt: '2026-05-30', status: 'active' },
      { id: 'L2605-002', url: 'https://slink.im/Cy6rJ2v', issuedAt: '2026-05-14', status: 'closed' },
      { id: 'L2604-012', url: 'https://slink.im/Mf3kP9d', issuedAt: '2026-04-27', status: 'closed' }
    ],

    /* 탈퇴 사유 선택지 */
    withdrawReasons: [
      '수익이 기대에 미치지 못해서',
      '콘텐츠 제작 활동을 중단해서',
      '수수료·정산 조건이 맞지 않아서',
      '이용 방법이 어렵고 복잡해서',
      '개인정보 관리가 부담되어서',
      '기타'
    ],

    withdrawnAt: null
  };

  /* ------------------------------------------------------------------
     2. 저장소
     ------------------------------------------------------------------ */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function read() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return clone(SEED);
      var saved = JSON.parse(raw);
      var base = clone(SEED);
      /* 저장된 가변 항목만 덮어쓴다 (더미 데이터 스키마 변경에 안전) */
      if (typeof saved.joined === 'boolean') base.joined = saved.joined;
      if (saved.withdrawnAt) base.withdrawnAt = saved.withdrawnAt;
      if (saved.creator) {
        base.creator.email = saved.creator.email || base.creator.email;
        base.creator.phone = saved.creator.phone || base.creator.phone;
        if (saved.creator.channels) base.creator.channels = saved.creator.channels;
      }
      return base;
    } catch (e) {
      return clone(SEED);
    }
  }

  function write(state) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify({
        joined: state.joined,
        withdrawnAt: state.withdrawnAt,
        creator: {
          email: state.creator.email,
          phone: state.creator.phone,
          channels: state.creator.channels
        }
      }));
    } catch (e) { /* 저장 불가 환경(프라이빗 모드 등)에서는 세션 내에서만 유지 */ }
  }

  var state = read();

  var Store = {
    /** 전체 상태 */
    get: function () { return state; },

    /** 총 수익 합계 */
    totalRevenue: function () {
      return state.revenue.reduce(function (s, m) { return s + m.amount; }, 0);
    },
    /** 이번 달(최신) 수익 */
    currentMonth: function () { return state.revenue[0]; },
    /** 전월 대비 증감액 */
    momDelta: function () {
      if (state.revenue.length < 2) return 0;
      return state.revenue[0].amount - state.revenue[1].amount;
    },
    /** 월 평균 수익 */
    avgRevenue: function () {
      return state.revenue.length ? Math.round(Store.totalRevenue() / state.revenue.length) : 0;
    },
    /** 지급 링크 전체 개수 */
    linkCount: function () { return state.links.length; },
    /** 활성 링크 개수 */
    activeLinkCount: function () {
      return state.links.filter(function (l) { return l.status === 'active'; }).length;
    },
    /** 최고 수익 월 */
    bestMonth: function () {
      return state.revenue.reduce(function (a, b) { return b.amount > a.amount ? b : a; }, state.revenue[0]);
    },
    maxMonthAmount: function () {
      return state.revenue.reduce(function (m, r) { return Math.max(m, r.amount); }, 0);
    },

    /** 서비스 탈퇴 처리 */
    withdraw: function (reason, etc) {
      state.joined = false;
      state.withdrawnAt = new Date().toISOString();
      state.withdrawReason = reason;
      state.withdrawEtc = etc || '';
      write(state);
    },

    /** 크리에이터 정보 부분 수정 */
    updateCreator: function (patch) {
      Object.keys(patch).forEach(function (k) { state.creator[k] = patch[k]; });
      write(state);
    },

    /** 시연 상태 초기화 */
    reset: function () {
      try { global.localStorage.removeItem(KEY); } catch (e) {}
      state = clone(SEED);
    }
  };

  global.AffiliateStore = Store;
})(window);
