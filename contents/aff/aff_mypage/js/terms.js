/**
 * terms.js  (v2.0)
 * [이용약관] 화면 - 가입 시 동의한 약관 / 운영정책 확인.
 * 문안은 어필리에이트 가입 신청 페이지의 약관 모달 원문과 동일하게 유지하며,
 * 동의 일시는 서버의 profile.joinedAt(신청일)을 기준으로 표기한다.
 *
 * 약관 본문은 사용자 데이터와 무관하므로 needsData:false 로 즉시 표시한다.
 * (Apps Script 왕복 2~4초를 기다릴 이유가 없다)
 * 동의 일시만 데이터 도착 후 조용히 채워진다.
 */
(function () {
  'use strict';

  var LF = window.LF;
  var VERSION = 'v1.0';

  var DOCS = {
    terms: {
      title: '서비스 이용약관',
      sections: [
        ['제1조 (목적)', '본 약관은 LFmall 인플루언서 어필리에이트 프로그램(이하 "서비스")의 이용과 관련하여 회사와 신청자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.'],
        ['제2조 (정의)', '"인플루언서"란 SNS 채널을 운영하며 본 서비스에 참여를 신청한 자를 말합니다. "어필리에이트 활동"이란 LFmall 상품을 자신의 채널에 소개하고 성과에 따라 수수료를 지급받는 활동을 말합니다.'],
        ['제3조 (신청 및 승인)', '서비스 참여는 신청 양식 제출 후 회사의 내부 심사를 거쳐 승인됩니다. 회사는 신청자의 채널 성격, 콘텐츠 품질 등을 종합적으로 검토하여 승인 여부를 결정할 수 있습니다.'],
        ['제4조 (개인정보의 수집 및 이용)', '회사는 서비스 신청 및 운영을 위해 이메일, 이름, 활동명, 휴대폰번호, SNS 채널 정보를 수집하며, 수집된 정보는 신청 접수 및 담당자 안내 목적으로만 이용됩니다.'],
        ['제5조 (신청자의 의무)', '신청자는 정확한 정보를 기재하여야 하며, 허위 정보 기재로 인한 불이익은 신청자 본인에게 있습니다.']
      ]
    },
    policy: {
      title: '서비스 운영정책',
      sections: [
        ['1. 콘텐츠 운영 기준', '인플루언서는 LFmall 브랜드 이미지에 부합하는 콘텐츠를 제작해야 하며, 허위·과장 광고, 타인의 권리를 침해하는 콘텐츠 게시를 금지합니다.'],
        ['2. 광고 표기 의무', '어필리에이트 링크가 포함된 콘텐츠에는 공정거래위원회 「추천·보증 등에 관한 표시·광고 심사지침」에 따라 경제적 대가 관계를 명확히 표기해야 합니다.'],
        ['3. 부정행위 금지', '자가 구매, 허위 클릭, 매크로 등 비정상적인 방법으로 성과를 발생시키는 행위는 금지되며, 적발 시 활동 자격이 제한되고 수수료 지급이 취소될 수 있습니다.'],
        ['4. 활동 자격의 변경 및 종료', '회사는 운영정책 위반, 장기간 미활동 등의 사유가 있는 경우 사전 안내 후 활동 자격을 조정하거나 종료할 수 있습니다.'],
        ['5. 정책의 변경', '본 운영정책은 서비스 개선을 위해 변경될 수 있으며, 변경 시 사전 공지합니다.']
      ]
    }
  };

  var POC_NOTE = '※ 본 문안은 POC용 예시입니다. 실제 서비스 오픈 시 법무 검토를 거친 정식 약관·정책으로 교체가 필요합니다.';

  /* 데이터 도착으로 재렌더될 때 보고 있던 탭을 유지한다. */
  var activeDoc = 'terms';

  LF.boot({ title: '이용약관', back: 'affiliate.html', skeleton: 'text', needsData: false }, render);

  function render(view, S) {
    var p = (S && S.profile()) || {};
    var agreedAt = p.joinedAt ? LF.fmtDate(p.joinedAt) : '';

    var tabs = LF.el('div', {
      className: 'tabs',
      attrs: { id: 'tabs', role: 'tablist', 'aria-label': '약관 종류' }
    }, [
      tabBtn('terms', DOCS.terms.title, activeDoc === 'terms'),
      tabBtn('policy', DOCS.policy.title, activeDoc === 'policy')
    ]);

    var area = LF.el('div', { attrs: { id: 'docArea' } });
    view.appendChild(tabs);
    view.appendChild(area);
    paintDoc(area, activeDoc, agreedAt);

    tabs.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('button[data-doc]') : null;
      if (!btn) return;
      LF.$$('#tabs button', view).forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      activeDoc = btn.getAttribute('data-doc');
      paintDoc(area, activeDoc, agreedAt);
      window.scrollTo(0, 0);
    });
  }

  function tabBtn(key, label, on) {
    return LF.el('button', {
      className: on ? 'is-on' : '',
      attrs: { type: 'button', role: 'tab', 'data-doc': key, 'aria-selected': on ? 'true' : 'false' },
      text: label
    });
  }

  function paintDoc(area, key, agreedAt) {
    var d = DOCS[key] || DOCS.terms;
    LF.clear(area);

    area.appendChild(LF.el('div', { className: 'agree-bar' }, [
      LF.el('span', { text: VERSION + ' · 가입 시 동의 완료' }),
      LF.el('b', { text: agreedAt || '-' })
    ]));

    var doc = LF.el('div', { className: 'terms-doc' });
    d.sections.forEach(function (s) {
      doc.appendChild(LF.el('h3', { text: s[0] }));
      doc.appendChild(LF.el('p', { text: s[1] }));
    });
    doc.appendChild(LF.el('p', { className: 'poc-note', text: POC_NOTE }));
    area.appendChild(doc);
  }
})();
