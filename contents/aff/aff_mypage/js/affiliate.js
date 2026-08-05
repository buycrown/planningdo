/**
 * affiliate.js  (v2.0)
 * [어필리에이트 서비스 활동 내역] 메인 화면 = 활동내역 진입점.
 *  - 앱바 우측은 뒤로가기 대신 '로그아웃' (최상위 화면)
 *  - 총 수익 대시보드 + '수익 현황 보러가기'
 *  - 서브 메뉴 : 내 링크 / 크리에이터 정보 / 이용약관 / 서비스 탈퇴하기
 *  - 팔로워 수 항목은 표시하지 않습니다.
 */
(function () {
  'use strict';

  var LF = window.LF;

  LF.boot({
    title: '어필리에이트 서비스 활동 내역',
    logout: true,
    skeleton: 'dashboard'
  }, render);

  function render(view, S) {
    var profile = S.profile() || {};
    var revenue = S.revenueList();
    var total = S.totalRevenue();
    var cur = S.currentMonth();
    var delta = S.momDelta();

    view.appendChild(creatorBar(profile, S));
    view.appendChild(hero(profile, S, total, cur, delta, revenue));
    view.appendChild(LF.el('div', { className: 'band' }));
    view.appendChild(subMenu(S));
    view.appendChild(LF.el('div', { className: 'band' }));
    view.appendChild(guide());

    countUp(view, total);
  }

  /* ------------------------------------------------------------------
     1. 크리에이터 요약 배너  (활동명 / 대표 채널)
     ------------------------------------------------------------------ */
  function creatorBar(profile, S) {
    var nickname = profile.nickname || '활동명 미등록';
    var ch = S.primaryChannel();

    /* 대표 채널 : '대표' 뱃지 + 채널명. 채널 수는 유형별 그룹 합계로 센다.
       (구 스키마 캐시로 snsByType 이 없어도 channels[] 폴백으로 같은 값이 나온다) */
    var total = (S.channelCount ? S.channelCount() : 0) || (profile.channels || []).length;
    var meta = LF.el('p', { className: 'creator-bar__meta' });
    if (ch) {
      meta.appendChild(LF.el('span', { className: 'badge-primary', text: '대표' }));
      meta.appendChild(LF.el('span', { text: ch.label + (ch.handle ? ' ' + ch.handle : '') }));
      if (total > 1) meta.appendChild(LF.el('span', { text: ' · 채널 ' + total + '개' }));
    } else {
      meta.textContent = '등록된 채널 없음';
    }

    var nameRow = LF.el('p', { className: 'creator-bar__name' }, [
      LF.el('span', { text: nickname })
    ]);
    if (profile.status) {
      nameRow.appendChild(LF.el('span', {
        className: 'chip-state ' + (profile.status === '활성' ? 'chip-state--on' : 'chip-state--off'),
        text: profile.status
      }));
    }

    return LF.el('section', { className: 'creator-bar' }, [
      LF.el('div', { className: 'creator-bar__thumb', attrs: { 'aria-hidden': 'true' }, text: nickname.charAt(0) }),
      LF.el('div', { className: 'creator-bar__txt' }, [nameRow, meta])
    ]);
  }

  /* ------------------------------------------------------------------
     2. 총 수익 대시보드
     ------------------------------------------------------------------ */
  function hero(profile, S, total, cur, delta, revenue) {
    var kids = [
      LF.el('p', { className: 'rev-hero__label' }, [
        LF.el('i', { className: 'dot' }),
        LF.el('span', { text: '총 수익 (누적)' })
      ]),
      LF.el('p', { className: 'rev-hero__amount' }, [
        LF.el('span', { className: 'js-count', attrs: { 'data-to': String(total) }, text: '0' }),
        LF.el('span', { className: 'won', text: '원' })
      ])
    ];

    if (delta !== 0 && revenue.length >= 2) {
      kids.push(LF.el('span', {
        className: 'rev-hero__delta' + (delta < 0 ? ' is-down' : ''),
        text: (delta > 0 ? '▲' : '▼') + ' 전월 대비 ' + LF.comma(Math.abs(delta)) + '원'
      }));
    }

    var months = S.activeMonths();
    kids.push(LF.el('ul', { className: 'rev-stats' }, [
      stat('이번 달 수익', cur ? LF.comma(cur.amount) : '0'),
      stat('월 평균 수익', LF.comma(S.avgRevenue())),
      stat('활동 기간', months + '개월')
    ]));

    if (profile.joinedAt) {
      kids.push(LF.el('p', { className: 'rev-hero__join', text: '가입일 ' + LF.fmtDate(profile.joinedAt) }));
    }

    if (!revenue.length) {
      kids.push(LF.el('p', {
        className: 'rev-hero__empty',
        text: '아직 집계된 수익이 없습니다. 지급받은 링크로 활동을 시작해 보세요.'
      }));
    }

    kids.push(LF.el('a', { className: 'rev-cta', attrs: { href: 'revenue.html' } }, [
      LF.el('span', { text: '수익 현황 보러가기' }),
      LF.icon('chevron')
    ]));

    return LF.el('section', { className: 'rev-hero' }, kids);
  }

  function stat(label, value) {
    return LF.el('li', {}, [
      LF.el('dt', { text: label }),
      LF.el('dd', { text: value })
    ]);
  }

  /* ------------------------------------------------------------------
     3. 서브 메뉴
     ------------------------------------------------------------------ */
  function subMenu(S) {
    var items = [
      { icon: 'link', label: '내 링크 확인하기', href: 'links.html', count: S.linkCount() },
      { icon: 'person', label: '크리에이터 정보', href: 'creator.html' },
      { icon: 'doc', label: '이용약관', href: 'terms.html' },
      { icon: 'exit', label: '서비스 탈퇴하기', href: 'withdraw.html' }
    ];

    return LF.el('ul', { className: 'menu-list' }, items.map(function (m) {
      var kids = [
        LF.icon(m.icon, 'ico'),
        LF.el('span', { text: m.label })
      ];
      if (m.count) kids.push(LF.el('em', { className: 'badge-count', text: String(m.count) }));
      kids.push(LF.icon('chevron', 'chev'));
      return LF.el('li', {}, LF.el('a', { attrs: { href: m.href } }, kids));
    }));
  }

  /* ------------------------------------------------------------------
     4. 안내 (정적 문구)
     ------------------------------------------------------------------ */
  function guide() {
    return LF.el('div', {
      className: 'pad',
      html:
        '<ul class="note">' +
          '<li>수익은 구매 확정 후 익월 정산 기준으로 집계됩니다.</li>' +
          '<li>취소·반품된 주문의 수익은 차감 반영됩니다.</li>' +
          '<li>정산 관련 문의는 어필리에이트 담당자 이메일로 접수해 주세요.</li>' +
        '</ul>'
    });
  }

  /* ------------------------------------------------------------------
     5. 총 수익 카운트업 연출
     ------------------------------------------------------------------ */
  function countUp(view, to) {
    var node = LF.$('.js-count', view);
    if (!node) return;
    if (!to) { node.textContent = '0'; return; }

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !window.requestAnimationFrame) {
      node.textContent = LF.comma(to);
      return;
    }

    var start = null, dur = 900;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      node.textContent = LF.comma(Math.round(to * eased));
      if (p < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }
})();
