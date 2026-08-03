/**
 * mypage.js
 * LFmall 마이페이지 재현 화면.
 * 핵심 : '나의 패션 클럽' 바로 아래에 [어필리에이트 서비스 활동 내역] 메뉴를 신설.
 *        어필리에이트 서비스 탈퇴(state.joined === false) 시 해당 메뉴는 노출되지 않음.
 */
(function () {
  'use strict';

  var LF = window.LF;
  var store = window.AffiliateStore.get();

  /* ------------------------------------------------------------------
     마이페이지 메뉴 정의 (LFmall 실제 메뉴 순서 기준)
     ------------------------------------------------------------------ */
  var MENUS = [
    { icon: 'review',   label: '상품리뷰',                    num: 7,  href: '#' },
    { icon: 'size',     label: 'MY 사이즈 관리',              href: '#' },
    { icon: 'oneclick', label: '원클릭 주문서 설정',           href: '#' },
    { icon: 'pay',      label: '간편결제',                    tag: '사용중', href: '#' },
    { icon: 'card',     label: 'LFmall 신용카드',             href: '#' },
    { icon: 'fashion',  label: '나의 패션 클럽',              href: '#' },

    /* ▼▼▼ 신설 메뉴 ▼▼▼ ------------------------------------------- */
    {
      key: 'affiliate',
      icon: 'affiliate',
      label: '어필리에이트 서비스 활동 내역',
      isNew: true,
      href: 'affiliate.html',
      requireJoined: true
    },
    /* ▲▲▲ 신설 메뉴 ▲▲▲ ------------------------------------------- */

    { icon: 'resale',   label: 'LF몰 공식 리세일 마켓 [엘리마켓]', href: '#' },
    { icon: 'fitting',  label: '매장방문 피팅 예약내역',        num: 11, href: '#' },
    { icon: 'as',       label: 'A/S 수선접수',                href: '#' },
    { icon: 'alarm',    label: '재입고 알림 내역',             href: '#' },
    { icon: 'event',    label: '이벤트/체험단 참여 내역',       href: '#' },
    { icon: 'refund',   label: '환불계좌관리',                href: '#' },
    { icon: 'address',  label: '배송지 관리',                 href: '#' }
  ];

  function menuRow(m) {
    var badge = m.isNew ? '<em class="badge-new">NEW</em>' : '';
    var num   = m.num ? '<em class="num">' + m.num + '</em>' : '';
    var tag   = m.tag ? '<em class="tag-state">' + m.tag + '</em>' : '';
    return '' +
      '<li' + (m.key ? ' data-menu="' + m.key + '"' : '') + '>' +
        '<a href="' + m.href + '">' +
          '<i class="ico" data-icon="' + m.icon + '"></i>' +
          num +
          '<span>' + m.label + '</span>' + badge +
          tag +
          '<i class="chev" data-icon="chevron"></i>' +
        '</a>' +
      '</li>';
  }

  /* ------------------------------------------------------------------
     상단 : 회원 요약 영역
     ------------------------------------------------------------------ */
  function topAreaHTML() {
    return '' +
      '<section class="my-top">' +
        '<div class="my-top__row">' +
          '<div class="my-top__grade">' + store.member.grade + '</div>' +
          '<div class="my-top__name"><strong>' + store.member.name + '</strong>님</div>' +
          '<a class="my-top__link" href="#">회원정보</a>' +
        '</div>' +
        '<a class="my-top__benefit" href="#">' +
          '<span>Gold : <b>2%</b> 구매적립, <b>13%</b> 쿠폰 <b>7장</b></span>' +
          '<i data-icon="chevron"></i>' +
        '</a>' +
        '<ul class="my-top__stats">' +
          '<li><dt>보유쿠폰</dt><dd>9</dd></li>' +
          '<li><dt>e기프트 마일리지</dt><dd>0</dd></li>' +
          '<li><dt>마일리지</dt><dd>16,049</dd></li>' +
          '<li><dt>엘리워드</dt><dd>0</dd></li>' +
        '</ul>' +
      '</section>' +
      '<section class="order-sum">' +
        '<div class="sect-head"><h2>주문목록 조회</h2><a class="more" href="#">전체보기<i data-icon="chevron"></i></a></div>' +
        '<ul class="order-sum__list">' +
          '<li><dd>0</dd><dt>주문접수</dt></li>' +
          '<li><dd>0</dd><dt>결제완료</dt></li>' +
          '<li><dd class="u-accent">1</dd><dt>상품/배송준비중</dt></li>' +
          '<li><dd class="u-accent">2</dd><dt>배송중</dt></li>' +
          '<li><dd class="u-accent">7</dd><dt>배송완료</dt></li>' +
        '</ul>' +
      '</section>';
  }

  /* ------------------------------------------------------------------
     렌더
     ------------------------------------------------------------------ */
  var visible = MENUS.filter(function (m) {
    return !(m.requireJoined && !store.joined);
  });

  var body =
    topAreaHTML() +
    '<div class="band"></div>' +
    '<ul class="menu-list">' + visible.map(menuRow).join('') + '</ul>' +
    '<div class="band"></div>' +
    (store.joined ? '' :
      '<p class="withdrawn-note">어필리에이트 서비스를 탈퇴하여 <b>활동 내역 메뉴가 노출되지 않습니다.</b><br>' +
      '재가입은 어필리에이트 가입 신청 페이지에서 가능합니다.</p>') +
    '<div class="spacer-40"></div>';

  LF.mountScreen({ title: '마이페이지', right: 'shop', tab: 'my', back: '#' }, body);
  LF.mountDemoTools();
})();
