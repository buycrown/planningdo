/**
 * creator.js  (v2.0)
 * [크리에이터 정보] 화면 - 가입 신청 시 입력한 정보 확인.
 * 심사 관련 항목(이름·활동명·사업자 유무·관심 카테고리·수수료)은 조회 전용,
 * 연락 수단(이메일·휴대폰)만 'userUpdateContact' 로 수정 가능.
 * ※ 팔로워 수 항목은 표시하지 않습니다.
 */
(function () {
  'use strict';

  var LF = window.LF;
  var Auth = window.LFAuth;
  var rerun = null;

  /* ------------------------------------------------------------------
     [v2.2] 회원ID = 정규화 이메일(profile.id), 화면 표시는 원본표기(profile.email).
     profile.id 를 화면에 찍지 않는다. 구 스키마 캐시(profile.id 가 UUID)에서도
     profile.email 만 쓰므로 화면이 깨지지 않는다.
     ------------------------------------------------------------------ */
  function displayEmail(p) {
    var e = String(p && p.email ? p.email : '').trim();
    if (e) return e;
    /* 응답에 email 이 빠진 경우에만 폴백. id 가 UUID(구 스키마)면 아무것도 보여주지 않는다. */
    var id = String(p && p.id ? p.id : '').trim();
    return id.indexOf('@') > 0 ? id : '';
  }

  /* 연락처 수정 실패 코드 → 사용자 안내 문구 (SPEC §3-0 / §4-0)
     문구가 아니라 code 로 분기한다. */
  var CONTACT_ERRORS = {
    DUPLICATE: '이미 사용 중인 이메일 또는 휴대폰번호입니다. 다른 값을 입력해 주세요.',
    EMAIL_REQUIRED: '이메일은 회원ID로 사용되므로 반드시 입력해야 합니다.',
    INVALID_EMAIL: '이메일 형식이 올바르지 않습니다. (예: name@example.com)',
    CASCADE_FAILED: '\u26A0\uFE0F 변경 도중 오류가 발생해 일부 정보가 갱신되지 않았을 수 있습니다. ' +
                    '다시 시도하지 마시고 어필리에이트 담당자에게 문의해 주세요.',
    BUSY: '다른 요청이 처리 중입니다. 잠시 후 다시 시도해 주세요.',
    SESSION_REBIND_REQUIRED: '회원ID가 변경되어 세션이 종료되었습니다. 다시 로그인해 주세요.',
    UNAUTHORIZED: '세션이 만료되었습니다. 다시 로그인해 주세요.'
  };
  function contactErrorMessage(err) {
    var code = err && err.code;
    if (code && Object.prototype.hasOwnProperty.call(CONTACT_ERRORS, code)) return CONTACT_ERRORS[code];
    return (err && err.message) || '수정에 실패했습니다. 잠시 후 다시 시도해 주세요.';
  }
  function needsRelogin(err) {
    var code = err && err.code;
    return code === 'SESSION_REBIND_REQUIRED' || code === 'UNAUTHORIZED';
  }

  rerun = LF.boot({ title: '크리에이터 정보', back: 'affiliate.html', skeleton: 'detail' }, render);

  function render(view, S) {
    var p = S.profile() || {};

    view.appendChild(headerBar(p, S));
    view.appendChild(sectHead('기본 정보'));
    view.appendChild(basicList(p, S));
    view.appendChild(LF.el('div', { className: 'band' }));
    view.appendChild(sectHead('정산 조건'));
    view.appendChild(rateBox(S));
    view.appendChild(LF.el('div', { className: 'band' }));
    view.appendChild(sectHead('관심 카테고리'));
    view.appendChild(categories(p));
    view.appendChild(LF.el('div', { className: 'band' }));
    view.appendChild(channelsSect(p, S));
    view.appendChild(guide());

    LF.setFoot(LF.el('div', { className: 'sticky-cta' },
      LF.el('button', {
        className: 'btn btn--line',
        attrs: { type: 'button' },
        text: '이메일 · 휴대폰번호 수정',
        on: { click: function () { openContactModal(p, S); } }
      })));
  }

  /* ------------------------------------------------------------------
     상단 요약
     ------------------------------------------------------------------ */
  function headerBar(p, S) {
    var nickname = p.nickname || '활동명 미등록';
    var nameRow = LF.el('p', { className: 'creator-bar__name' }, [LF.el('span', { text: nickname })]);
    if (p.status) {
      nameRow.appendChild(LF.el('span', {
        className: 'chip-state ' + (p.status === '활성' ? 'chip-state--on' : 'chip-state--off'),
        text: p.status
      }));
    }

    var metaBits = [];
    if (p.joinedAt) metaBits.push('가입일 ' + LF.fmtDate(p.joinedAt));
    metaBits.push('활동 기간 ' + S.activeMonths() + '개월');

    return LF.el('section', { className: 'creator-bar' }, [
      LF.el('div', { className: 'creator-bar__thumb', attrs: { 'aria-hidden': 'true' }, text: nickname.charAt(0) }),
      LF.el('div', { className: 'creator-bar__txt' }, [
        nameRow,
        LF.el('p', { className: 'creator-bar__meta', text: metaBits.join(' · ') })
      ])
    ]);
  }

  function sectHead(title, sub) {
    var kids = [LF.el('h2', { text: title })];
    if (sub) kids.push(LF.el('span', { className: 'u-gray', text: sub }));
    return LF.el('div', { className: 'sect-head' }, kids);
  }

  /* ------------------------------------------------------------------
     기본 정보
     ------------------------------------------------------------------ */
  function row(label, value, locked, id) {
    var dd = LF.el('dd', { className: locked ? 'is-locked' : '', text: value || '-' });
    if (id) dd.setAttribute('id', id);
    return LF.el('div', {}, [LF.el('dt', { text: label }), dd]);
  }

  /** 대표 채널 행 : 값 옆에 '대표' 뱃지를 함께 노출한다 */
  function primaryRow(ch) {
    var dd = LF.el('dd', { className: 'is-locked' });
    if (ch) {
      dd.appendChild(LF.el('span', { className: 'badge-primary', text: '대표' }));
      dd.appendChild(LF.el('span', { text: ch.label + (ch.handle ? ' ' + ch.handle : '') }));
    } else {
      dd.textContent = '등록된 채널 없음';
    }
    return LF.el('div', {}, [LF.el('dt', { text: '대표 채널' }), dd]);
  }

  function basicList(p, S) {
    var ch = S.primaryChannel();
    return LF.el('dl', { className: 'def-list' }, [
      row('활동명', p.nickname, true),
      row('이름', p.name, true),
      primaryRow(ch),
      row('이메일', displayEmail(p), false, 'fEmail'),
      row('휴대폰번호', p.phone, false, 'fPhone'),
      row('사업자 유무', p.bizStatus, true),
      row('활동 기간', S.activeMonths() + '개월' + (p.joinedAt ? ' (가입일 ' + LF.fmtDate(p.joinedAt) + ')' : ''), true)
    ]);
  }

  /* ------------------------------------------------------------------
     정산 조건 (수수료)
     ------------------------------------------------------------------ */
  function rateBox(S) {
    var has = S.hasCommission();
    return LF.el('div', { className: 'rate-box' }, [
      LF.el('div', { className: 'rate-box__main' }, [
        LF.el('span', { className: 'rate-box__label', text: '판매 수수료' }),
        LF.el('span', { className: 'rate-box__value' + (has ? '' : ' is-none'), text: S.commissionLabel() })
      ]),
      LF.el('p', {
        className: 'rate-box__desc',
        text: has
          ? '구매 확정 금액(부가세 별도) 기준으로 산정됩니다.'
          : '수수료율이 아직 지정되지 않았습니다. 담당자 확정 후 표시됩니다.'
      })
    ]);
  }

  /* ------------------------------------------------------------------
     관심 카테고리
     ------------------------------------------------------------------ */
  function categories(p) {
    var list = p.categories || [];
    if (!list.length) {
      return LF.el('div', { className: 'pad-b' },
        LF.el('p', { className: 'u-gray', text: '등록된 관심 카테고리가 없습니다.' }));
    }
    return LF.el('div', { className: 'pad-b' },
      LF.el('div', { className: 'chips' }, list.map(function (c) {
        return LF.el('span', { text: c });
      })));
  }

  /* ------------------------------------------------------------------
     SNS 채널 — 유형별 그룹 (팔로워 수 미표기)
     ------------------------------------------------------------------
     · AffiliateStore.channelGroups() 가 profile.snsByType 을 우선 사용하고
       없으면(구 스키마 캐시 포함) profile.channels[] 로 폴백한다.
     · 같은 유형이 여러 개면 한 그룹 안에 여러 줄로 들어간다.
     · URL 은 LF.safeUrl() 을 통과한 http(s) 주소만 앵커로 렌더한다.
     ------------------------------------------------------------------ */
  function channelsSect(p, S) {
    var groups = (S && S.channelGroups) ? S.channelGroups() : [];
    var total = groups.reduce(function (n, g) { return n + g.items.length; }, 0);
    /* 그룹이 비어 있으면 채널 배열로 한 번 더 확인한다 (스토어 미갱신 방어) */
    if (!total) total = (p.channels || []).length;

    var wrap = LF.el('div', {});
    wrap.appendChild(sectHead('SNS 채널', total ? total + '개 운영 중' : ''));

    if (!groups.length) {
      wrap.appendChild(LF.el('div', { className: 'pad-b' },
        LF.el('p', { className: 'u-gray', text: '등록된 SNS 채널이 없습니다.' })));
      return wrap;
    }

    wrap.appendChild(LF.el('div', { className: 'sns-list' }, groups.map(groupCard)));
    return wrap;
  }

  function groupCard(g) {
    var head = [
      LF.icon(iconName(g.type), 'sns-card__ico sns-card__ico--' + shortType(g.type)),
      LF.el('p', { className: 'sns-group__title', text: g.label })
    ];
    if (g.primary) head.push(LF.el('span', { className: 'badge-primary', text: '대표' }));
    if (g.items.length > 1) head.push(LF.el('span', { className: 'sns-group__count', text: g.items.length + '개' }));

    return LF.el('section', { className: 'sns-group' + (g.primary ? ' is-primary' : '') }, [
      LF.el('div', { className: 'sns-group__head' }, head),
      LF.el('ul', { className: 'sns-group__items' }, g.items.map(function (it) {
        return channelItem(it, g);
      }))
    ]);
  }

  function channelItem(it, g) {
    var txt = [LF.el('p', { className: 'sns-item__name', text: it.name || it.label || it.url })];
    if (it.desc && it.desc !== it.name) txt.push(LF.el('p', { className: 'sns-item__desc', text: it.desc }));

    var kids = [LF.el('div', { className: 'sns-item__txt' }, txt)];
    /* 그룹 안에 여러 개일 때만 어떤 줄이 대표인지 표시한다 (1개면 그룹 뱃지로 충분) */
    if (it.primary && g.items.length > 1) {
      kids.push(LF.el('span', { className: 'badge-primary', text: '대표' }));
    }

    var href = LF.safeUrl(it.url);
    if (href) {
      kids.push(LF.el('a', {
        className: 'sns-card__link',
        attrs: {
          href: href, target: '_blank', rel: 'noopener noreferrer',
          'aria-label': (it.name || g.label || '채널') + ' 열기'
        }
      }, LF.icon('arrowR')));
    }
    return LF.el('li', { className: 'sns-item' }, kids);
  }

  function shortType(t) {
    return { instagram: 'ig', youtube: 'yt', tiktok: 'tt', x: 'x' }[String(t || '').toLowerCase()] || 'etc';
  }
  function iconName(t) {
    var k = String(t || '').toLowerCase();
    return { instagram: 'instagram', youtube: 'youtube', tiktok: 'tiktok', x: 'x' }[k] || 'link';
  }

  /* ------------------------------------------------------------------
     안내 (정적 문구)
     ------------------------------------------------------------------ */
  function guide() {
    return LF.el('div', {
      className: 'pad-b',
      html:
        '<ul class="note">' +
          '<li>이름·활동명·사업자 유무·관심 카테고리·판매 수수료는 심사 및 계약 기준 항목으로 직접 수정할 수 없습니다.</li>' +
          '<li>판매 수수료는 활동 실적과 카테고리에 따라 회사와의 협의로 조정될 수 있습니다.</li>' +
          '<li>SNS 채널 변경이 필요한 경우 어필리에이트 담당자에게 문의해 주세요.</li>' +
        '</ul>'
    });
  }

  /* ------------------------------------------------------------------
     연락처 수정 (userUpdateContact)
     ------------------------------------------------------------------ */
  function openContactModal(p, S) {
    var emailInput = LF.el('input', {
      attrs: { type: 'email', id: 'ctEmail', value: displayEmail(p), autocomplete: 'email',
               inputmode: 'email', placeholder: 'name@example.com' }
    });
    /*
     * 서버(profile.phone)는 '010-****-1234' 로 마스킹되어 내려온다.
     * 이 값을 그대로 입력창에 채우면
     *   ① 사용자가 수정하지 않아도 형식 검증에 걸려 저장이 막히고
     *   ② 한 글자만 입력해도 마스킹 문자가 섞여 값이 망가진다.
     * 따라서 마스킹된 값은 채우지 않고 placeholder 로만 현재 값을 안내하며,
     * 변경할 때만 전체 번호를 새로 입력받는다.
     */
    var phoneMasked = String(p.phone || '').indexOf('*') !== -1;
    var phoneInput = LF.el('input', {
      attrs: {
        type: 'tel', id: 'ctPhone',
        value: phoneMasked ? '' : (p.phone || ''),
        autocomplete: 'tel', inputmode: 'numeric', maxlength: '13',
        placeholder: phoneMasked ? '현재 ' + p.phone + ' · 변경 시 전체 번호 입력' : '010-0000-0000'
      }
    });
    var phoneHint = phoneMasked
      ? LF.el('p', {
          className: 'msg u-gray',
          text: '휴대폰번호는 보호를 위해 일부만 표시됩니다. 변경할 때만 전체 번호를 입력해 주세요.'
        })
      : null;
    var msg = LF.el('p', { className: 'msg', attrs: { role: 'alert', 'aria-live': 'polite' } });

    phoneInput.addEventListener('input', function () {
      if (Auth && /[0-9]/.test(phoneInput.value)) phoneInput.value = Auth.formatPhone(phoneInput.value);
    });

    var body = LF.el('div', { className: 'modal__body modal__body--form' }, [
      LF.el('p', { className: 'modal__title', text: '연락처 수정' }),
      LF.el('p', { className: 'modal__desc', text: '이메일과 휴대폰번호는 로그인 식별자로도 사용됩니다.' }),
      LF.el('div', { className: 'spacer-24' }),
      LF.el('div', { className: 'field' }, [
        LF.el('label', { attrs: { 'for': 'ctEmail' }, text: '이메일' }), emailInput
      ]),
      LF.el('div', { className: 'field' }, [
        LF.el('label', { attrs: { 'for': 'ctPhone' }, text: '휴대폰번호' }), phoneInput, phoneHint
      ]),
      msg
    ]);

    var btnCancel = LF.el('button', { attrs: { type: 'button' }, text: '취소' });
    var btnSave = LF.el('button', { className: 'is-primary', attrs: { type: 'button' }, text: '저장' });
    var m = LF.openModal([body, LF.el('div', { className: 'modal__foot' }, [btnCancel, btnSave])]);

    btnCancel.addEventListener('click', function () { m.close(); });

    btnSave.addEventListener('click', function () {
      var email = String(emailInput.value || '').trim();
      var phone = String(phoneInput.value || '').trim();

      if (!email && !phone) { msg.textContent = '이메일 또는 휴대폰번호를 입력해 주세요.'; return; }
      if (email && Auth && !Auth.isEmail(email)) { msg.textContent = '이메일 형식이 올바르지 않습니다.'; return; }
      if (phone && Auth && !Auth.isPhone(phone)) { msg.textContent = '휴대폰번호 형식이 올바르지 않습니다.'; return; }

      msg.textContent = '';
      btnSave.disabled = true;
      btnCancel.disabled = true;
      btnSave.textContent = '저장 중…';

      /* 비워 둔 항목은 아예 보내지 않는다.
         (빈 문자열을 보내면 서버는 무시하지만 화면 캐시가 비워져 값이 사라진다) */
      var patch = {};
      if (email) patch.email = email;
      if (phone) patch.phone = phone;

      S.updateContact(patch).then(function () {
        m.close();
        LF.toast('연락처가 수정되었습니다.');
        if (rerun) rerun();
      })['catch'](function (err) {
        btnSave.disabled = false;
        btnCancel.disabled = false;
        btnSave.textContent = '저장';
        msg.textContent = contactErrorMessage(err);
        /* 회원ID 변경으로 세션이 끊긴 경우에만 로그인 화면으로 보낸다. */
        if (needsRelogin(err)) {
          window.setTimeout(function () {
            if (Auth && typeof Auth.clearSession === 'function') { try { Auth.clearSession(); } catch (e) {} }
            window.location.replace(
              (window.LFSite && typeof window.LFSite.resolve === 'function')
                ? window.LFSite.resolve('login')
                : '../04_로그인/login.html');
          }, 1600);
        }
      });
    });
  }
})();
