/**
 * withdraw.js
 * [서비스 탈퇴하기] 화면.
 * 플로우 : 유의사항 안내 → 탈퇴 사유 선택 → 동의 체크 → 확인 모달 → 완료
 * 탈퇴 완료 시 AffiliateStore.joined = false 로 전환되어
 * 마이페이지에서 '어필리에이트 서비스 활동 내역' 메뉴가 미노출된다.
 */
(function () {
  'use strict';

  var LF = window.LF;
  var S  = window.AffiliateStore;
  var st = S.get();

  /* 이미 탈퇴한 경우 완료 화면 */
  if (!st.joined) { renderDone(); return; }

  var selected = null;
  var agreed   = false;

  /* ------------------------------------------------------------------
     입력 화면
     ------------------------------------------------------------------ */
  var notice =
    '<div class="wd-head">' +
      '<h2>어필리에이트 서비스를<br>탈퇴하시겠습니까?</h2>' +
      '<p>탈퇴 전 아래 유의사항을 반드시 확인해 주세요.</p>' +
    '</div>' +
    '<div class="wd-notice">' +
      '<p class="wd-notice__title"><i data-icon="warn"></i>탈퇴 시 유의사항</p>' +
      '<ul class="note">' +
        '<li>마이페이지에서 <b>어필리에이트 서비스 활동 내역 메뉴가 즉시 미노출</b>됩니다.</li>' +
        '<li>발급된 모든 어필리에이트 링크가 비활성화되어 더 이상 성과가 집계되지 않습니다.</li>' +
        '<li>미정산 수익은 탈퇴 시점 기준으로 확정되어 다음 정산일에 지급됩니다.</li>' +
        '<li>누적 활동 내역과 수익 이력은 복구되지 않습니다.</li>' +
        '<li>재가입은 탈퇴일로부터 30일 경과 후 신규 신청·심사를 통해 가능합니다.</li>' +
      '</ul>' +
    '</div>';

  var reasons =
    '<div class="wd-step"><h3>탈퇴 사유를 알려주세요</h3><p>서비스 개선에 소중하게 활용하겠습니다. (필수)</p></div>' +
    '<div class="reason-list" id="reasonList">' +
      st.withdrawReasons.map(function (r, i) {
        return '<label class="reason-item" data-idx="' + i + '">' +
                 '<input type="radio" name="reason" value="' + r + '">' +
                 '<span class="radio"></span><span>' + r + '</span>' +
               '</label>';
      }).join('') +
    '</div>' +
    '<div class="reason-etc u-hidden" id="etcArea">' +
      '<textarea id="etcText" maxlength="200" placeholder="상세 사유를 입력해 주세요. (선택)"></textarea>' +
      '<p class="cnt"><span id="etcCnt">0</span>/200</p>' +
    '</div>' +
    '<label class="agree-check" id="agreeBox">' +
      '<input type="checkbox">' +
      '<span class="box"><i data-icon="check"></i></span>' +
      '<span>위 유의사항을 모두 확인했으며 탈퇴에 동의합니다.</span>' +
    '</label>' +
    '<div class="spacer-24"></div>';

  var foot =
    '<div class="sticky-cta">' +
      '<div class="btn-area btn-area--row" style="padding:0">' +
        '<a class="btn btn--ghost" href="affiliate.html">취소</a>' +
        '<button type="button" class="btn btn--danger" id="btnWithdraw" disabled>탈퇴하기</button>' +
      '</div>' +
    '</div>';

  LF.mountScreen({ title: '서비스 탈퇴하기', back: 'affiliate.html' }, notice + reasons, foot);
  LF.mountDemoTools();

  /* ------------------------------------------------------------------
     이벤트
     ------------------------------------------------------------------ */
  var btn = LF.$('#btnWithdraw');

  function refresh() { btn.disabled = !(selected && agreed); }

  LF.$('#reasonList').addEventListener('change', function (e) {
    selected = e.target.value;
    LF.$$('.reason-item').forEach(function (el) {
      el.classList.toggle('is-on', el.contains(e.target));
    });
    LF.$('#etcArea').classList.toggle('u-hidden', selected !== '기타');
    refresh();
  });

  LF.$('#etcText').addEventListener('input', function (e) {
    LF.$('#etcCnt').textContent = e.target.value.length;
  });

  LF.$('#agreeBox').addEventListener('change', function (e) {
    agreed = e.target.checked;
    LF.$('#agreeBox').classList.toggle('is-on', agreed);
    refresh();
  });

  btn.addEventListener('click', function () {
    LF.confirmModal({
      title: '정말 탈퇴하시겠습니까?',
      desc: '탈퇴 시 <b>활동 내역 메뉴가 마이페이지에서 사라지며</b><br>' +
            '누적된 활동·수익 이력은 복구되지 않습니다.',
      cancel: '더 생각해볼게요',
      confirm: '탈퇴하기'
    }).then(function (ok) {
      if (!ok) return;
      S.withdraw(selected, LF.$('#etcText').value);
      renderDone();
    });
  });

  /* ------------------------------------------------------------------
     완료 화면
     ------------------------------------------------------------------ */
  function renderDone() {
    LF.mountScreen({ title: '서비스 탈퇴하기', back: 'index.html' },
      '<div class="done">' +
        '<div class="done__ico"><i data-icon="check"></i></div>' +
        '<h2>탈퇴가 완료되었습니다</h2>' +
        '<p>그동안 LFmall 어필리에이트 서비스를<br>이용해 주셔서 감사합니다.<br><br>' +
        '마이페이지에서 <b>어필리에이트 서비스 활동 내역</b> 메뉴가<br>더 이상 표시되지 않습니다.</p>' +
      '</div>',
      '<div class="sticky-cta">' +
        '<a class="btn btn--primary" href="index.html">마이페이지로 이동</a>' +
      '</div>');
    LF.mountDemoTools();
  }
})();
