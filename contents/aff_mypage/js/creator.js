/**
 * creator.js
 * [크리에이터 정보] 화면 - 가입 신청 시 입력한 정보 확인.
 * 항목 구성은 어필리에이트 가입 신청 양식(buycrown.cloud/contents/aff_join)을 기준으로 함.
 * 심사 관련 항목(아이디/이름/활동명/사업자 유무/관심 카테고리)은 조회 전용,
 * 연락 수단(이메일·휴대폰)과 SNS 채널만 수정 가능.
 */
(function () {
  'use strict';

  var LF = window.LF;
  var S  = window.AffiliateStore;
  var st = S.get();
  var c  = st.creator;

  if (!st.joined) { location.replace('affiliate.html'); return; }

  function row(dt, dd, locked) {
    return '<div><dt>' + dt + '</dt><dd class="' + (locked ? 'is-locked' : '') + '">' + dd + '</dd></div>';
  }

  /* 1. 신청/승인 상태 --------------------------------------------------- */
  var statusBox =
    '<div class="creator-bar">' +
      '<div class="creator-bar__thumb">' + c.nickname.charAt(0) + '</div>' +
      '<div class="creator-bar__txt">' +
        '<p class="creator-bar__name">' + c.nickname +
          '<span class="chip-state chip-state--on">' + c.status + '</span></p>' +
        '<p class="creator-bar__meta">신청일 ' + c.appliedAt + ' · 승인일 ' + c.approvedAt + '</p>' +
      '</div>' +
    '</div>';

  /* 2. 기본 정보 -------------------------------------------------------- */
  var basic =
    '<div class="sect-head"><h2>기본 정보</h2></div>' +
    '<dl class="def-list">' +
      row('LFmall 아이디', st.member.lfmallId, true) +
      row('이름', c.nickname === st.member.name ? c.nickname : '최*석', true) +
      row('활동명', c.nickname, true) +
      row('이메일', '<span id="fEmail">' + c.email + '</span>') +
      row('휴대폰번호', '<span id="fPhone">' + c.phone + '</span>') +
      row('사업자 유무', c.bizType, true) +
      row('첨부파일', c.attachments.join(', '), true) +
    '</dl>';

  /* 3. 정산 조건 -------------------------------------------------------- */
  var settle =
    '<div class="sect-head"><h2>정산 조건</h2></div>' +
    '<div class="rate-box">' +
      '<div class="rate-box__main">' +
        '<span class="rate-box__label">판매 수수료</span>' +
        '<span class="rate-box__value">' + c.commissionRate + '</span>' +
      '</div>' +
      '<p class="rate-box__desc">' + c.settleBase + '</p>' +
    '</div>' +
    '<dl class="def-list">' +
      row('정산 주기', c.settleCycle, true) +
      row('적용 시작일', c.approvedAt, true) +
    '</dl>';

  /* 4. 관심 카테고리 ---------------------------------------------------- */
  var cats =
    '<div class="sect-head"><h2>관심 카테고리</h2></div>' +
    '<div style="padding:0 16px 20px"><div class="chips">' +
      c.categories.map(function (x) { return '<span>' + x + '</span>'; }).join('') +
    '</div></div>';

  /* 5. SNS 채널 --------------------------------------------------------- */
  var chans =
    '<div class="sect-head"><h2>SNS 채널</h2><span class="u-gray" style="font-size:12px">' + c.channels.length + '개 운영 중</span></div>' +
    '<div class="sns-list">' +
      c.channels.map(function (ch) {
        return '<div class="sns-card">' +
                 '<span class="sns-card__ico sns-card__ico--' + shortType(ch.type) + '" data-icon="' + ch.type + '"></span>' +
                 '<div class="sns-card__body">' +
                   '<p class="sns-card__name">' + ch.handle + '</p>' +
                   '<p class="sns-card__meta">' + ch.label + ' · 팔로워 ' + LF.shortCount(ch.followers) + '</p>' +
                 '</div>' +
               '</div>';
      }).join('') +
    '</div>';

  function shortType(t) {
    return { instagram: 'ig', youtube: 'yt', tiktok: 'tt', x: 'x' }[t] || 'x';
  }

  /* 6. 안내 ------------------------------------------------------------- */
  var guide =
    '<div style="padding:0 16px 24px">' +
      '<ul class="note">' +
        '<li>이름·활동명·사업자 유무·관심 카테고리·판매 수수료는 심사 및 계약 기준 항목으로 직접 수정할 수 없습니다.</li>' +
        '<li>판매 수수료는 활동 실적과 카테고리에 따라 회사와의 협의로 조정될 수 있습니다.</li>' +
        '<li>수정이 필요한 경우 어필리에이트 담당자에게 문의해 주세요.</li>' +
      '</ul>' +
    '</div>';

  var body = statusBox + basic +
             '<div class="band"></div>' + settle +
             '<div class="band"></div>' + cats +
             '<div class="band"></div>' + chans + guide;

  var foot =
    '<div class="sticky-cta">' +
      '<button type="button" class="btn btn--line" id="btnEdit">연락처 · SNS 채널 수정</button>' +
    '</div>';

  LF.mountScreen({ title: '크리에이터 정보', back: 'affiliate.html' }, body, foot);
  LF.mountDemoTools();

  /* 수정 (시연 : 안내 토스트) */
  LF.$('#btnEdit').addEventListener('click', function () {
    LF.confirmModal({
      title: '정보 수정',
      desc: '이메일, 휴대폰번호, SNS 채널 정보를<br>수정할 수 있습니다.<br><br>' +
            '<span class="u-gray" style="font-size:12px">※ 시연 버전에서는 수정 화면이 제공되지 않습니다.</span>',
      cancel: '닫기',
      confirm: '확인'
    });
  });
})();
