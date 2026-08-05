/**
 * links.js  (v2.0)
 * [내 링크 확인하기] 화면.
 * LF 담당자가 지급한 어필리에이트 링크를 활성 / 예정 / 종료 구분 없이 모두 노출한다.
 *  - active    : 검정 '활성' 뱃지 · 복사 가능
 *  - scheduled : 파랑 '예정' 뱃지 · 시작일 안내 · 복사 가능
 *  - closed    : 회색 '종료' 뱃지 · 카드 opacity .55 · 복사 버튼 비활성
 * 링크 URL·링크명은 textContent / setAttribute 로만 주입한다. (XSS 방지)
 */
(function () {
  'use strict';

  var LF = window.LF;

  var STATUS = {
    active:    { label: '활성', chip: 'chip-state--active' },
    scheduled: { label: '예정', chip: 'chip-state--scheduled' },
    closed:    { label: '종료', chip: 'chip-state--closed' }
  };

  var filter = 'all';

  LF.boot({ title: '내 링크 확인하기', back: 'affiliate.html', skeleton: 'list' }, render);

  function render(view, S) {
    var links = S.links();

    if (!links.length) {
      LF.renderEmpty(view, {
        icon: 'link',
        title: '지급받은 링크가 없습니다',
        desc: 'LF 담당자가 기획전·상품 단위로 링크를 발급하면\n이 화면에서 확인하고 복사할 수 있습니다.',
        actionText: '활동 내역으로 돌아가기',
        actionHref: 'affiliate.html'
      });
      return;
    }

    var counts = {
      all: links.length,
      active: count(links, 'active'),
      scheduled: count(links, 'scheduled'),
      closed: count(links, 'closed')
    };

    view.appendChild(summary(counts));
    view.appendChild(filterBar(counts));

    var area = LF.el('div', { attrs: { id: 'linkArea' } });
    view.appendChild(area);
    paintList(area, links);

    view.appendChild(guide());

    LF.$('#filterBar', view).addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('button[data-f]') : null;
      if (!btn) return;
      filter = btn.getAttribute('data-f');
      LF.$$('#filterBar button', view).forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      paintList(area, links);
    });
  }

  function count(links, status) {
    return links.filter(function (l) { return l.status === status; }).length;
  }

  /* ------------------------------------------------------------------
     상단 요약
     ------------------------------------------------------------------ */
  function summary(c) {
    return LF.el('section', { className: 'link-summary' }, [
      LF.el('p', { className: 'link-summary__label', text: '지급받은 어필리에이트 링크' }),
      LF.el('p', { className: 'link-summary__count' }, [
        LF.el('b', { text: String(c.all) }),
        LF.el('span', { text: '건' })
      ]),
      LF.el('p', {
        className: 'link-summary__sub',
        text: '활성 ' + c.active + '건 · 예정 ' + c.scheduled + '건 · 종료 ' + c.closed + '건'
      })
    ]);
  }

  /* ------------------------------------------------------------------
     필터
     ------------------------------------------------------------------ */
  function filterBar(c) {
    var defs = [
      { key: 'all', label: '전체', n: c.all },
      { key: 'active', label: '활성', n: c.active },
      { key: 'scheduled', label: '예정', n: c.scheduled },
      { key: 'closed', label: '종료', n: c.closed }
    ];
    return LF.el('div', {
      className: 'filter-bar',
      attrs: { id: 'filterBar', role: 'group', 'aria-label': '링크 상태 필터' }
    }, defs.map(function (d) {
      return LF.el('button', {
        className: d.key === filter ? 'is-on' : '',
        attrs: { type: 'button', 'data-f': d.key, 'aria-pressed': d.key === filter ? 'true' : 'false' }
      }, [
        LF.el('span', { text: d.label }),
        LF.el('em', { text: String(d.n) })
      ]);
    }));
  }

  /* ------------------------------------------------------------------
     리스트
     ------------------------------------------------------------------ */
  function paintList(area, links) {
    var items = filter === 'all'
      ? links
      : links.filter(function (l) { return l.status === filter; });

    LF.clear(area);

    if (!items.length) {
      LF.renderEmpty(area, {
        icon: 'empty',
        title: '해당 상태의 링크가 없습니다',
        desc: '다른 필터를 선택해 주세요.'
      });
      return;
    }

    area.appendChild(LF.el('ul', { className: 'link-list' }, items.map(linkItem)));
    LF.paintIcons(area);
  }

  function linkItem(l) {
    var meta = STATUS[l.status] || STATUS.active;
    var closed = l.status === 'closed';

    /* 제목 : 링크명이 있으면 링크명, 없으면 링크 ID */
    var head = LF.el('div', { className: 'link-item__head' }, [
      LF.el('p', { className: 'link-item__name', text: l.name || ('링크 ' + (l.id || '')) }),
      LF.el('span', { className: 'chip-state ' + meta.chip, text: meta.label })
    ]);

    /* 등록일 / 유효기간 */
    var period = LF.fmtDate(l.startAt || l.issuedAt) + ' ~ ' + (l.endAt ? LF.fmtDate(l.endAt) : '무기한');
    var metaRow = LF.el('div', { className: 'link-item__meta' }, [
      LF.el('span', {}, [LF.icon('calendar'), LF.el('span', { text: '유효기간 ' + period })]),
      l.issuedAt ? LF.el('span', { text: '등록 ' + LF.fmtDate(l.issuedAt) }) : null
    ]);

    /* URL : http(s) 로 시작할 때만 앵커로 렌더 */
    var href = LF.safeUrl(l.url);
    var urlNode;
    if (href && !closed) {
      urlNode = LF.el('a', {
        className: 'link-item__url',
        attrs: { href: href, target: '_blank', rel: 'noopener noreferrer' },
        text: href
      });
    } else {
      urlNode = LF.el('p', { className: 'link-item__url', text: href || (l.url || '유효하지 않은 링크입니다.') });
    }

    /* 하단 : 안내 문구 + 복사 버튼 */
    var footKids = [];
    if (l.status === 'scheduled' && l.startAt) {
      footKids.push(LF.el('p', {
        className: 'link-item__note',
        text: LF.fmtDate(l.startAt) + '부터 사용할 수 있습니다.'
      }));
    } else if (closed) {
      footKids.push(LF.el('p', { className: 'link-item__note u-gray', text: '종료된 링크입니다.' }));
    }
    footKids.push(copyBtn(href, closed));

    return LF.el('li', { className: 'link-item' + (closed ? ' is-closed' : '') }, [
      head, metaRow, urlNode, LF.el('div', { className: 'link-item__foot' }, footKids)
    ]);
  }

  function copyBtn(href, closed) {
    if (closed || !href) {
      return LF.el('button', {
        className: 'btn-copy',
        attrs: { type: 'button', disabled: true },
        text: '복사 불가'
      });
    }

    var btn = LF.el('button', { className: 'btn-copy', attrs: { type: 'button' } },
      [LF.icon('copy'), LF.el('span', { text: '링크 복사' })]);

    btn.addEventListener('click', function () {
      LF.copyText(href).then(function () {
        btn.classList.add('is-done');
        LF.clear(btn).appendChild(LF.el('span', { text: '복사 완료' }));
        LF.toast('링크가 복사되었습니다.');
        window.setTimeout(function () {
          btn.classList.remove('is-done');
          LF.clear(btn);
          btn.appendChild(LF.icon('copy'));
          btn.appendChild(LF.el('span', { text: '링크 복사' }));
          LF.paintIcons(btn);
        }, 1600);
      })['catch'](function () {
        LF.toast('복사에 실패했습니다. 링크를 길게 눌러 복사해 주세요.');
      });
    });

    return btn;
  }

  /* ------------------------------------------------------------------
     안내 (정적 문구)
     ------------------------------------------------------------------ */
  function guide() {
    return LF.el('div', {
      className: 'pad-b',
      html:
        '<ul class="note">' +
          '<li>링크는 LF 담당자가 기획전·상품 단위로 발급하여 지급합니다.</li>' +
          '<li>복사한 링크를 SNS 콘텐츠에 게시하면 성과가 자동 집계됩니다.</li>' +
          '<li>「추천·보증 등에 관한 표시·광고 심사지침」에 따라 경제적 대가 관계를 반드시 표기해 주세요.</li>' +
          '<li>예정 링크는 유효 시작일부터 성과가 집계됩니다.</li>' +
          '<li>종료된 링크는 더 이상 성과가 집계되지 않으며 복사할 수 없습니다.</li>' +
        '</ul>'
    });
  }
})();
