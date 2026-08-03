/**
 * revenue.js
 * [수익 현황] 화면 - 달별로 발생한 수익 현황.
 */
(function () {
  'use strict';

  var LF = window.LF;
  var S  = window.AffiliateStore;
  var st = S.get();

  var total = S.totalRevenue();
  var max   = S.maxMonthAmount();
  var best  = S.bestMonth();

  /* 상단 요약 */
  var summary =
    '<section class="rev-hero" style="padding-bottom:16px">' +
      '<p class="rev-hero__label"><i class="dot"></i>' + st.revenue.length + '개월 누적 수익</p>' +
      '<p class="rev-hero__amount">' + LF.comma(total) + '<span class="won">원</span></p>' +
      '<ul class="rev-stats">' +
        '<li><dt>월 평균</dt><dd>' + LF.comma(S.avgRevenue()) + '</dd></li>' +
        '<li><dt>최고 수익 월</dt><dd>' + best.label.replace('년 ', '.').replace('월', '') + '</dd></li>' +
        '<li><dt>집계 기간</dt><dd>' + st.revenue.length + '개월</dd></li>' +
      '</ul>' +
    '</section>';

  /* 월별 리스트 */
  var rows = st.revenue.map(function (m, i) {
    var pct = max ? Math.round(m.amount / max * 100) : 0;
    return '' +
      '<li>' +
        '<div class="month-row">' +
          '<span class="month-row__ym">' + m.label +
            (i === 0 ? '<span>이번 달</span>' : '') +
          '</span>' +
          '<span class="month-row__amt">' + LF.comma(m.amount) + '원</span>' +
        '</div>' +
        '<div class="month-bar"><i data-pct="' + pct + '"></i></div>' +
        '<div class="month-sub">' +
          '<span>누적 대비 <b>' + (m.amount / total * 100).toFixed(1) + '%</b></span>' +
          (m.amount === best.amount ? '<span class="u-accent">최고 수익</span>' : '') +
        '</div>' +
      '</li>';
  }).join('');

  var body =
    summary +
    '<div class="band"></div>' +
    '<div class="sect-head"><h2>월별 수익 현황</h2><span class="u-gray" style="font-size:12px">최근 ' + st.revenue.length + '개월</span></div>' +
    '<ul class="month-list">' + rows + '</ul>' +
    '<dl class="sum-bar"><dt>합계</dt><dd>' + LF.comma(total) + '원</dd></dl>' +
    '<div style="padding:20px 16px 36px">' +
      '<ul class="note">' +
        '<li>매월 1일에 전월 확정 수익이 반영됩니다.</li>' +
        '<li>구매 확정 전 주문은 집계에서 제외됩니다.</li>' +
        '<li>클릭수·구매전환수 등 상세 성과 지표는 현재 제공되지 않습니다.</li>' +
        '<li>본 화면의 수치는 시연용 예시 데이터입니다.</li>' +
      '</ul>' +
    '</div>';

  LF.mountScreen({ title: '수익 현황', back: 'affiliate.html' }, body);
  LF.mountDemoTools();

  /* 막대 그래프 애니메이션 */
  requestAnimationFrame(function () {
    LF.$$('.month-bar > i').forEach(function (bar, idx) {
      setTimeout(function () { bar.style.width = bar.dataset.pct + '%'; }, 60 * idx);
    });
  });
})();
