/**
 * affiliate.js
 * [어필리에이트 서비스 활동 내역] 메인 화면.
 *  - 총 수익 대시보드 + '수익 현황 보러가기'
 *  - 서브 메뉴 : 크리에이터 정보 / 이용약관 / 서비스 탈퇴하기
 */
(function () {
  'use strict';

  var LF = window.LF;
  var S  = window.AffiliateStore;
  var st = S.get();

  /* 탈퇴 회원이 URL 로 직접 진입한 경우 방어 */
  if (!st.joined) {
    LF.mountScreen({ title: '어필리에이트 서비스 활동 내역', back: 'index.html' },
      '<div class="empty">' +
        '<i data-icon="empty"></i>' +
        '<p>어필리에이트 서비스에 가입되어 있지 않습니다.<br>가입 신청 후 이용해 주세요.</p>' +
      '</div>' +
      '<div class="btn-area"><a class="btn btn--line" href="index.html">마이페이지로 돌아가기</a></div>');
    LF.mountDemoTools();
    return;
  }

  var total   = S.totalRevenue();
  var cur     = S.currentMonth();
  var delta   = S.momDelta();
  var creator = st.creator;

  /* ------------------------------------------------------------------
     1. 크리에이터 요약 배너
     ------------------------------------------------------------------ */
  var mainCh = creator.channels[0];
  var creatorBar =
    '<div class="creator-bar">' +
      '<div class="creator-bar__thumb">' + creator.nickname.charAt(0) + '</div>' +
      '<div class="creator-bar__txt">' +
        '<p class="creator-bar__name">' + creator.nickname +
          '<span class="chip-state chip-state--on">' + creator.status + '</span>' +
        '</p>' +
        '<p class="creator-bar__meta">' + mainCh.label + ' ' + mainCh.handle +
          ' · 팔로워 ' + LF.shortCount(mainCh.followers) +
          ' · 채널 ' + creator.channels.length + '개</p>' +
      '</div>' +
    '</div>';

  /* ------------------------------------------------------------------
     2. 총 수익 대시보드
     ------------------------------------------------------------------ */
  var deltaHTML = '';
  if (delta !== 0) {
    deltaHTML =
      '<span class="rev-hero__delta">' +
        (delta > 0 ? '▲' : '▼') + ' 전월 대비 ' + LF.comma(Math.abs(delta)) + '원' +
      '</span>';
  }

  var hero =
    '<section class="rev-hero">' +
      '<p class="rev-hero__label"><i class="dot"></i>총 수익 (누적)</p>' +
      '<p class="rev-hero__amount"><span class="js-count" data-to="' + total + '">0</span><span class="won">원</span></p>' +
      deltaHTML +
      '<ul class="rev-stats">' +
        '<li><dt>이번 달 수익</dt><dd>' + LF.comma(cur.amount) + '</dd></li>' +
        '<li><dt>월 평균 수익</dt><dd>' + LF.comma(S.avgRevenue()) + '</dd></li>' +
        '<li><dt>활동 기간</dt><dd>' + st.revenue.length + '개월</dd></li>' +
      '</ul>' +
      '<a class="rev-cta" href="revenue.html">수익 현황 보러가기 <i data-icon="chevron"></i></a>' +
    '</section>';

  /* ------------------------------------------------------------------
     3. 서브 메뉴
     ------------------------------------------------------------------ */
  var SUB = [
    { icon: 'link',   label: '내 링크 확인하기', href: 'links.html', count: S.linkCount() },
    { icon: 'person', label: '크리에이터 정보',  href: 'creator.html' },
    { icon: 'doc',    label: '이용약관',        href: 'terms.html' },
    { icon: 'exit',   label: '서비스 탈퇴하기',  href: 'withdraw.html' }
  ];

  var subMenu =
    '<ul class="menu-list">' + SUB.map(function (m) {
      var count = m.count ? '<em class="badge-count">' + m.count + '</em>' : '';
      return '<li><a href="' + m.href + '">' +
               '<i class="ico" data-icon="' + m.icon + '"></i>' +
               '<span>' + m.label + '</span>' + count +
               '<i class="chev" data-icon="chevron"></i>' +
             '</a></li>';
    }).join('') + '</ul>';

  /* ------------------------------------------------------------------
     4. 안내
     ------------------------------------------------------------------ */
  var guide =
    '<div style="padding:20px 16px 36px">' +
      '<ul class="note">' +
        '<li>수익은 구매 확정 후 익월 정산 기준으로 집계됩니다.</li>' +
        '<li>취소·반품된 주문의 수익은 차감 반영됩니다.</li>' +
        '<li>정산 관련 문의는 어필리에이트 담당자 이메일로 접수해 주세요.</li>' +
      '</ul>' +
    '</div>';

  var body = creatorBar + hero + '<div class="band"></div>' + subMenu + '<div class="band"></div>' + guide;

  LF.mountScreen({ title: '어필리에이트 서비스 활동 내역', back: 'index.html' }, body);
  LF.mountDemoTools();

  /* ------------------------------------------------------------------
     5. 총 수익 카운트업 연출
     ------------------------------------------------------------------ */
  (function countUp() {
    var el = LF.$('.js-count');
    if (!el) return;
    var to = Number(el.dataset.to), start = null, dur = 900;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = LF.comma(Math.round(to * eased));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  })();
})();
