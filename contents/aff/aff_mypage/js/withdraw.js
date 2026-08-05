/**
 * withdraw.js  (v2.0)
 * [서비스 탈퇴하기] 화면.
 * 플로우 : 유의사항 안내 → 탈퇴 사유 선택 → 동의 체크 → 확인 모달 → 'userWithdraw' → 완료
 * 탈퇴가 완료되면 세션을 종료하고 로그인 화면으로 이동한다.
 */
(function () {
  'use strict';

  var LF = window.LF;
  var rerun = null;

  /* 탈퇴 사유 선택지 (화면 상수) */
  var REASONS = [
    '수익이 기대에 미치지 못해서',
    '콘텐츠 제작 활동을 중단해서',
    '수수료·정산 조건이 맞지 않아서',
    '이용 방법이 어렵고 복잡해서',
    '개인정보 관리가 부담되어서',
    '기타'
  ];

  rerun = LF.boot({ title: '서비스 탈퇴하기', back: 'affiliate.html', skeleton: 'text' }, render);

  function render(view, S) {
    var selected = null;
    var agreed = false;

    view.appendChild(notice());

    var etcArea = LF.el('div', { className: 'reason-etc u-hidden' });
    var etcText = LF.el('textarea', {
      attrs: { id: 'etcText', maxlength: '200', placeholder: '상세 사유를 입력해 주세요. (선택)', 'aria-label': '기타 상세 사유' }
    });
    var etcCnt = LF.el('span', { text: '0' });
    etcArea.appendChild(etcText);
    etcArea.appendChild(LF.el('p', { className: 'cnt' }, [etcCnt, LF.el('span', { text: '/200' })]));

    var reasonList = LF.el('div', {
      className: 'reason-list',
      attrs: { id: 'reasonList', role: 'radiogroup', 'aria-label': '탈퇴 사유' }
    }, REASONS.map(function (r, i) {
      return LF.el('label', { className: 'reason-item' }, [
        LF.el('input', { attrs: { type: 'radio', name: 'reason', value: r, id: 'reason' + i } }),
        LF.el('span', { className: 'radio', attrs: { 'aria-hidden': 'true' } }),
        LF.el('span', { text: r })
      ]);
    }));

    var agreeBox = LF.el('label', { className: 'agree-check' }, [
      LF.el('input', { attrs: { type: 'checkbox' } }),
      LF.el('span', { className: 'box' }, LF.icon('check')),
      LF.el('span', { text: '위 유의사항을 모두 확인했으며 탈퇴에 동의합니다.' })
    ]);

    view.appendChild(LF.el('div', { className: 'wd-step' }, [
      LF.el('h3', { text: '탈퇴 사유를 알려주세요' }),
      LF.el('p', { text: '서비스 개선에 소중하게 활용하겠습니다. (필수)' })
    ]));
    view.appendChild(reasonList);
    view.appendChild(etcArea);
    view.appendChild(agreeBox);
    view.appendChild(LF.el('div', { className: 'spacer-24' }));

    var btnWithdraw = LF.el('button', {
      className: 'btn btn--danger',
      attrs: { type: 'button', disabled: true },
      text: '탈퇴하기'
    });

    LF.setFoot(LF.el('div', { className: 'sticky-cta' },
      LF.el('div', { className: 'btn-area btn-area--row', attrs: { style: 'padding:0' } }, [
        LF.el('a', { className: 'btn btn--ghost', attrs: { href: 'affiliate.html' }, text: '취소' }),
        btnWithdraw
      ])));

    function refresh() { btnWithdraw.disabled = !(selected && agreed); }

    reasonList.addEventListener('change', function (e) {
      selected = e.target.value;
      LF.$$('.reason-item', reasonList).forEach(function (el) {
        el.classList.toggle('is-on', el.contains(e.target));
      });
      etcArea.classList.toggle('u-hidden', selected !== '기타');
      refresh();
    });

    etcText.addEventListener('input', function () { etcCnt.textContent = String(etcText.value.length); });

    agreeBox.addEventListener('change', function (e) {
      agreed = !!e.target.checked;
      agreeBox.classList.toggle('is-on', agreed);
      refresh();
    });

    btnWithdraw.addEventListener('click', function () {
      LF.confirmModal({
        title: '정말 탈퇴하시겠습니까?',
        desc: '탈퇴 시 <b>발급된 모든 링크가 비활성화</b>되며<br>누적된 활동·수익 이력은 복구되지 않습니다.',
        cancel: '더 생각해볼게요',
        confirm: '탈퇴하기'
      }).then(function (ok) {
        if (!ok) return;
        btnWithdraw.disabled = true;
        btnWithdraw.textContent = '처리 중…';

        S.withdraw(selected, etcText.value).then(function () {
          /*
           * 탈퇴 성공 : 개인정보가 담긴 캐시를 반드시 폐기한다.
           * (Store.withdraw 내부에서도 폐기하지만, 화면 책임으로도 한 번 더 못 박는다)
           * 백그라운드 갱신이 완료 화면을 덮어쓰지 않도록 자동 재렌더도 멈춘다.
           */
          if (S.clearCache) S.clearCache();
          if (rerun && rerun.stop) rerun.stop();
          renderDone(view);
        })['catch'](function (err) {
          btnWithdraw.disabled = false;
          btnWithdraw.textContent = '탈퇴하기';
          LF.toast((err && err.message) || '탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        });
      });
    });
  }

  /* ------------------------------------------------------------------
     유의사항 (정적 문구)
     ------------------------------------------------------------------ */
  function notice() {
    return LF.el('div', {
      html:
        '<div class="wd-head">' +
          '<h2>어필리에이트 서비스를<br>탈퇴하시겠습니까?</h2>' +
          '<p>탈퇴 전 아래 유의사항을 반드시 확인해 주세요.</p>' +
        '</div>' +
        '<div class="wd-notice">' +
          '<p class="wd-notice__title"><i data-icon="warn"></i>탈퇴 시 유의사항</p>' +
          '<ul class="note">' +
            '<li>탈퇴 즉시 어필리에이트 <b>활동 내역 조회가 중단</b>됩니다.</li>' +
            '<li>발급된 모든 어필리에이트 링크가 비활성화되어 더 이상 성과가 집계되지 않습니다.</li>' +
            '<li>미정산 수익은 탈퇴 시점 기준으로 확정되어 다음 정산일에 지급됩니다.</li>' +
            '<li>누적 활동 내역과 수익 이력은 복구되지 않습니다.</li>' +
            '<li>재가입은 탈퇴일로부터 30일 경과 후 신규 신청·심사를 통해 가능합니다.</li>' +
          '</ul>' +
        '</div>'
    });
  }

  /* ------------------------------------------------------------------
     완료 화면
     ------------------------------------------------------------------ */
  function renderDone(view) {
    LF.clear(view);
    view.appendChild(LF.el('div', { className: 'done' }, [
      LF.el('div', { className: 'done__ico' }, LF.icon('check')),
      LF.el('h2', { text: '탈퇴가 완료되었습니다' }),
      LF.el('p', {
        html: '그동안 LFmall 어필리에이트 서비스를<br>이용해 주셔서 감사합니다.<br><br>' +
              '로그인 세션이 종료되며 활동 내역은 더 이상 조회할 수 없습니다.'
      })
    ]));
    LF.paintIcons(view);

    LF.setFoot(LF.el('div', { className: 'sticky-cta' },
      LF.el('button', {
        className: 'btn btn--primary',
        attrs: { type: 'button' },
        text: '로그인 화면으로',
        on: {
          click: function () {
            if (window.LFAuth) window.LFAuth.logout();
            else window.location.replace(LF.LOGIN_URL);
          }
        }
      })));

    window.scrollTo(0, 0);
  }
})();
