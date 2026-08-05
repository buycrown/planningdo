/**
 * revenue.js  (v2.0)
 * [수익 현황] 화면 - ADMIN 이 등록한 월별 수익(revenue[])을 조회한다.
 */
(function () {
  'use strict';

  var LF = window.LF;

  LF.boot({ title: '수익 현황', back: 'affiliate.html', skeleton: 'list' }, render);

  function render(view, S) {
    var list = S.revenueList();

    if (!list.length) {
      LF.renderEmpty(view, {
        icon: 'chart',
        title: '집계된 수익이 없습니다',
        desc: '구매가 확정되면 매월 1일에 전월 수익이 반영됩니다.\n지급받은 링크로 활동을 시작해 보세요.',
        actionText: '내 링크 확인하기',
        actionHref: 'links.html'
      });
      return;
    }

    var total = S.totalRevenue();
    var max = S.maxMonthAmount();
    var best = S.bestMonth();

    view.appendChild(summary(S, list, total, best));
    view.appendChild(LF.el('div', { className: 'band' }));
    view.appendChild(sectHead(list.length));
    view.appendChild(monthList(list, total, max, best));
    view.appendChild(sumBar(total));
    view.appendChild(guide());

    animateBars(view);
  }

  /* ------------------------------------------------------------------
     상단 요약
     ------------------------------------------------------------------ */
  function summary(S, list, total, best) {
    return LF.el('section', { className: 'rev-hero' }, [
      LF.el('p', { className: 'rev-hero__label' }, [
        LF.el('i', { className: 'dot' }),
        LF.el('span', { text: list.length + '개월 누적 수익' })
      ]),
      LF.el('p', { className: 'rev-hero__amount' }, [
        LF.el('span', { text: LF.comma(total) }),
        LF.el('span', { className: 'won', text: '원' })
      ]),
      LF.el('ul', { className: 'rev-stats' }, [
        stat('월 평균', LF.comma(S.avgRevenue())),
        stat('최고 수익 월', best ? shortYm(best.ym, best.label) : '-'),
        stat('활동 기간', S.activeMonths() + '개월')
      ])
    ]);
  }

  function stat(label, value) {
    return LF.el('li', {}, [LF.el('dt', { text: label }), LF.el('dd', { text: value })]);
  }

  /** '2026-07' -> '2026.07' */
  function shortYm(ym, label) {
    return /^\d{4}-\d{2}$/.test(String(ym || '')) ? String(ym).replace('-', '.') : (label || '-');
  }

  function sectHead(n) {
    return LF.el('div', { className: 'sect-head' }, [
      LF.el('h2', { text: '월별 수익 현황' }),
      LF.el('span', { className: 'u-gray', text: '최근 ' + n + '개월' })
    ]);
  }

  /* ------------------------------------------------------------------
     월별 리스트
     ------------------------------------------------------------------ */
  function monthList(list, total, max, best) {
    return LF.el('ul', { className: 'month-list' }, list.map(function (m, i) {
      var pct = max ? Math.round(m.amount / max * 100) : 0;

      var ym = LF.el('span', { className: 'month-row__ym', text: m.label || LF.fmtYm(m.ym) });
      if (i === 0) ym.appendChild(LF.el('span', { text: '최근 달' }));

      var sub = [LF.el('span', {}, [
        LF.el('span', { text: '누적 대비 ' }),
        LF.el('b', { text: LF.ratio(m.amount, total) + '%' })
      ])];
      if (best && m.amount === best.amount && m.amount > 0) {
        sub.push(LF.el('span', { className: 'u-accent', text: '최고 수익' }));
      }

      return LF.el('li', {}, [
        LF.el('div', { className: 'month-row' }, [
          ym,
          LF.el('span', { className: 'month-row__amt', text: LF.won(m.amount) })
        ]),
        LF.el('div', { className: 'month-bar' },
          LF.el('i', { attrs: { 'data-pct': String(pct) } })),
        LF.el('div', { className: 'month-sub' }, sub)
      ]);
    }));
  }

  function sumBar(total) {
    return LF.el('dl', { className: 'sum-bar' }, [
      LF.el('dt', { text: '합계' }),
      LF.el('dd', { text: LF.won(total) })
    ]);
  }

  /* ------------------------------------------------------------------
     안내 (정적 문구)
     ------------------------------------------------------------------ */
  function guide() {
    return LF.el('div', {
      className: 'pad',
      html:
        '<ul class="note">' +
          '<li>매월 1일에 전월 확정 수익이 반영됩니다.</li>' +
          '<li>구매 확정 전 주문은 집계에서 제외됩니다.</li>' +
          '<li>클릭수·구매전환수 등 상세 성과 지표는 현재 제공되지 않습니다.</li>' +
          '<li>정산 관련 문의는 어필리에이트 담당자에게 접수해 주세요.</li>' +
        '</ul>'
    });
  }

  /* ------------------------------------------------------------------
     막대 그래프 애니메이션
     ------------------------------------------------------------------ */
  function animateBars(view) {
    var bars = LF.$$('.month-bar > i', view);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    bars.forEach(function (bar, idx) {
      var w = bar.getAttribute('data-pct') + '%';
      if (reduce) { bar.style.width = w; return; }
      window.setTimeout(function () { bar.style.width = w; }, 60 * idx);
    });
  }
})();
