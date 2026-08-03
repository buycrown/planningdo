/**
 * links.js
 * [내 링크 확인하기] 화면.
 * LF 실무자가 해당 인플루언서에게 지급한 어필리에이트 링크 내역을 조회한다.
 *  - 링크 URL / 등록일 / 활성·종료 상태
 *  - 링크 복사 (종료된 링크는 복사 비활성)
 *  - 필터 : 전체 / 활성 / 종료
 */
(function () {
  'use strict';

  var LF = window.LF;
  var S  = window.AffiliateStore;
  var st = S.get();

  if (!st.joined) { location.replace('affiliate.html'); return; }

  var filter = 'all';

  /* ------------------------------------------------------------------
     리스트 렌더
     ------------------------------------------------------------------ */
  function visibleLinks() {
    if (filter === 'all') return st.links;
    return st.links.filter(function (l) { return l.status === filter; });
  }

  function linkItem(l) {
    var closed = l.status === 'closed';
    return '' +
      '<li class="link-item' + (closed ? ' is-closed' : '') + '">' +
        '<div class="link-item__head">' +
          '<span class="link-item__date">' + l.issuedAt.replace(/-/g, '.') + ' 등록</span>' +
          '<span class="chip-state ' + (closed ? 'chip-state--off' : 'chip-state--on') + '">' +
            (closed ? '종료' : '활성') +
          '</span>' +
        '</div>' +
        '<p class="link-item__url">' + l.url + '</p>' +
        '<div class="link-item__foot">' +
          '<span class="link-item__id">' + l.id + '</span>' +
          (closed
            ? '<button type="button" class="btn-copy" disabled>복사 불가</button>'
            : '<button type="button" class="btn-copy js-copy" data-url="' + l.url + '">' +
                '<i data-icon="copy"></i>링크 복사</button>') +
        '</div>' +
      '</li>';
  }

  function listHTML() {
    var items = visibleLinks();
    if (!items.length) {
      return '<div class="empty"><i data-icon="empty"></i>' +
             '<p>해당하는 링크가 없습니다.</p></div>';
    }
    return '<ul class="link-list">' + items.map(linkItem).join('') + '</ul>';
  }

  /* ------------------------------------------------------------------
     화면 구성
     ------------------------------------------------------------------ */
  var summary =
    '<section class="link-summary">' +
      '<p class="link-summary__label">지급받은 어필리에이트 링크</p>' +
      '<p class="link-summary__count"><b>' + S.linkCount() + '</b>건</p>' +
      '<p class="link-summary__sub">활성 ' + S.activeLinkCount() + '건 · 종료 ' +
        (S.linkCount() - S.activeLinkCount()) + '건</p>' +
    '</section>';

  var filters =
    '<div class="filter-bar" id="filterBar">' +
      '<button type="button" class="is-on" data-f="all">전체 <em>' + st.links.length + '</em></button>' +
      '<button type="button" data-f="active">활성 <em>' + S.activeLinkCount() + '</em></button>' +
      '<button type="button" data-f="closed">종료 <em>' + (S.linkCount() - S.activeLinkCount()) + '</em></button>' +
    '</div>';

  var guide =
    '<div style="padding:4px 16px 36px">' +
      '<ul class="note">' +
        '<li>링크는 LF 담당자가 기획전·상품 단위로 발급하여 지급합니다.</li>' +
        '<li>복사한 링크를 SNS 콘텐츠에 게시하면 성과가 자동 집계됩니다.</li>' +
        '<li>「추천·보증 등에 관한 표시·광고 심사지침」에 따라 경제적 대가 관계를 반드시 표기해 주세요.</li>' +
        '<li>종료된 링크는 더 이상 성과가 집계되지 않으며 복사할 수 없습니다.</li>' +
      '</ul>' +
    '</div>';

  var body = summary + filters + '<div id="linkArea">' + listHTML() + '</div>' + guide;

  LF.mountScreen({ title: '내 링크 확인하기', back: 'affiliate.html' }, body);
  LF.mountDemoTools();

  /* ------------------------------------------------------------------
     필터
     ------------------------------------------------------------------ */
  LF.$('#filterBar').addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    filter = btn.dataset.f;
    LF.$$('#filterBar button').forEach(function (b) { b.classList.toggle('is-on', b === btn); });
    LF.$('#linkArea').innerHTML = listHTML();
    LF.paintIcons(LF.$('#linkArea'));
    bindCopy();
  });

  /* ------------------------------------------------------------------
     링크 복사
     ------------------------------------------------------------------ */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    /* file:// · http 환경 폴백 */
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject();
      } catch (err) { reject(err); }
      ta.remove();
    });
  }

  function bindCopy() {
    LF.$$('.js-copy').forEach(function (btn) {
      btn.addEventListener('click', function () {
        copyText(btn.dataset.url).then(function () {
          btn.classList.add('is-done');
          btn.innerHTML = '복사 완료';
          LF.toast('링크가 복사되었습니다.');
          setTimeout(function () {
            btn.classList.remove('is-done');
            btn.innerHTML = '<i data-icon="copy"></i>링크 복사';
            LF.paintIcons(btn);
          }, 1600);
        }).catch(function () {
          LF.toast('복사에 실패했습니다. 링크를 길게 눌러 복사해 주세요.');
        });
      });
    });
  }
  bindCopy();
})();
