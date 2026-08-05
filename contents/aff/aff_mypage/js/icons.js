/**
 * icons.js
 * LFmall 마이페이지 아이콘과 동일한 무드(1.3px 라인 아이콘, 24x24, 단색 #111)의
 * 인라인 SVG 아이콘 세트.
 * 스프라이트 이미지 대신 SVG를 사용해 GitHub 배포 시 외부 의존성을 없앴습니다.
 */
(function (global) {
  'use strict';

  var S = 'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"';
  var box = function (inner) {
    return '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
  };

  var ICONS = {
    /* ---- 마이페이지 기존 메뉴 (LFmall 원본 아이콘 무드 재현) ---- */
    review:   box('<path ' + S + ' d="M3.5 5.5h13v10h-9l-4 3.5z"/><path ' + S + ' d="M7 9h6M7 12h4"/>'),
    size:     box('<path ' + S + ' d="M8.5 4.5 5 6.5v5l1.5 1v7h11v-7l1.5-1v-5l-3.5-2"/><path ' + S + ' d="M8.5 4.5a3.5 3.5 0 0 0 7 0"/>'),
    oneclick: box('<path ' + S + ' d="M9 11V6.2a1.6 1.6 0 0 1 3.2 0V13"/><path ' + S + ' d="M12.2 10.6a1.5 1.5 0 0 1 3 0V13m0-1.4a1.5 1.5 0 0 1 3 0v4.2A4.2 4.2 0 0 1 14 20h-1.2a4.4 4.4 0 0 1-3.4-1.7L6 14.2a1.5 1.5 0 0 1 2.3-1.9L9 13"/>'),
    pay:      box('<rect ' + S + ' x="2.8" y="5.5" width="18.4" height="13" rx="2"/><path ' + S + ' d="M2.8 9.8h18.4"/><path ' + S + ' d="M6.2 14.4h3.4"/>'),
    card:     box('<rect ' + S + ' x="2.8" y="5.5" width="18.4" height="13" rx="2"/><path ' + S + ' d="M2.8 9h18.4M6.2 14.4h4"/>'),
    fashion:  box('<circle ' + S + ' cx="12" cy="5" r="2.1"/><path ' + S + ' d="M12 7.4v6.2m0 0-3.4 6.4m3.4-6.4 3.4 6.4M7.6 10.2 12 8.6l4.4 1.6"/>'),
    resale:   box('<circle ' + S + ' cx="12" cy="12" r="8.5"/><path ' + S + ' d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5S14.4 18.1 12 20.5c-2.4-2.4-3.6-5.3-3.6-8.5S9.6 5.9 12 3.5z"/>'),
    fitting:  box('<path ' + S + ' d="M4 20.5v-8l4-2.2 2.4-1.5"/><path ' + S + ' d="M13.6 8.8 16 10.3l4 2.2v8"/><path ' + S + ' d="M4 20.5h16"/><circle ' + S + ' cx="12" cy="5.4" r="2.2"/>'),
    as:       box('<path ' + S + ' d="m4 19.4 8.6-8.6"/><path ' + S + ' d="M14.6 4.8a3.9 3.9 0 0 1 5.1 5.1l-2.1-.5-2.5-2.5z"/><path ' + S + ' d="m12.6 10.8 2.5 2.5"/>'),
    alarm:    box('<path ' + S + ' d="M6.4 10.4a5.6 5.6 0 0 1 11.2 0c0 4 1.4 5.6 1.4 5.6H5s1.4-1.6 1.4-5.6z"/><path ' + S + ' d="M10.2 19a2 2 0 0 0 3.6 0"/>'),
    event:    box('<rect ' + S + ' x="3.4" y="5.6" width="17.2" height="14" rx="2"/><path ' + S + ' d="M3.4 10h17.2M8 3.6v3.6M16 3.6v3.6"/><path ' + S + ' d="m9.4 14.6 1.8 1.8 3.4-3.4"/>'),
    refund:   box('<rect ' + S + ' x="3.4" y="4.6" width="14" height="16" rx="2"/><path ' + S + ' d="M6.8 9h7.2M6.8 12.6h4.4"/><circle ' + S + ' cx="17.6" cy="16.2" r="3.6"/><path ' + S + ' d="m16.1 16.2 1.1 1.1 2-2.1"/>'),
    address:  box('<path ' + S + ' d="M12 21s6.4-5.3 6.4-10a6.4 6.4 0 1 0-12.8 0c0 4.7 6.4 10 6.4 10z"/><circle ' + S + ' cx="12" cy="11" r="2.3"/>'),

    /* ---- 신규 : 어필리에이트 서비스 활동 내역 (SNS 공유/네트워크) ---- */
    affiliate: box(
      '<circle ' + S + ' cx="17.4" cy="5.8" r="2.7"/>' +
      '<circle ' + S + ' cx="6" cy="12" r="2.7"/>' +
      '<circle ' + S + ' cx="17.4" cy="18.2" r="2.7"/>' +
      '<path ' + S + ' d="m8.4 10.7 6.6-3.6m0 9.8-6.6-3.6"/>'
    ),

    /* ---- 어필리에이트 서브 메뉴 ---- */
    person:   box('<circle ' + S + ' cx="12" cy="8" r="3.6"/><path ' + S + ' d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/>'),
    doc:      box('<path ' + S + ' d="M6 3.4h7.6L18.6 8v12.6H6z"/><path ' + S + ' d="M13.4 3.4V8h5"/><path ' + S + ' d="M9 12.6h6M9 16h4"/>'),
    exit:     box('<path ' + S + ' d="M14.6 4.4H6.8v15.2h7.8"/><path ' + S + ' d="M11.8 12h8.4m0 0-2.9-2.9m2.9 2.9-2.9 2.9"/>'),
    chart:    box('<path ' + S + ' d="M4 20h16"/><path ' + S + ' d="M6.6 20V12M11.4 20V6.4M16.2 20v-5.6"/>'),
    link:     box('<path ' + S + ' d="M10.1 13.9a3.6 3.6 0 0 0 5.1 0l3.1-3.1a3.6 3.6 0 0 0-5.1-5.1l-1.6 1.6"/><path ' + S + ' d="M13.9 10.1a3.6 3.6 0 0 0-5.1 0l-3.1 3.1a3.6 3.6 0 0 0 5.1 5.1l1.6-1.6"/>'),
    copy:     box('<rect ' + S + ' x="8.6" y="8.6" width="11" height="11" rx="2"/><path ' + S + ' d="M15.4 5.4H6.4a2 2 0 0 0-2 2v9"/>'),

    /* ---- 공통 UI ---- */
    chevron:  box('<path ' + S + ' d="m9.4 5.6 6.4 6.4-6.4 6.4"/>'),
    back:     box('<path ' + S + ' d="m14.6 5.6-6.4 6.4 6.4 6.4"/>'),
    arrowR:   box('<path ' + S + ' d="M4.4 12h15.2m0 0-5.6-5.6M19.6 12l-5.6 5.6"/>'),
    search:   box('<circle ' + S + ' cx="11" cy="11" r="6.4"/><path ' + S + ' d="m15.8 15.8 4 4"/>'),
    cart:     box('<path ' + S + ' d="M4 6.4h2.4l2 11.2h10L20.4 9H7"/><circle ' + S + ' cx="9.4" cy="20.4" r="1.2"/><circle ' + S + ' cx="17.4" cy="20.4" r="1.2"/>'),
    check:    box('<path ' + S + ' d="m5 12.6 4.6 4.6L19 6.8"/>'),
    warn:     box('<path ' + S + ' d="M12 4.2 21 19.4H3z"/><path ' + S + ' d="M12 10v4"/><circle fill="currentColor" cx="12" cy="16.8" r="0.9"/>'),
    up:       box('<path ' + S + ' d="M12 19V5m0 0-5.4 5.4M12 5l5.4 5.4"/>'),
    empty:    box('<circle ' + S + ' cx="12" cy="12" r="8.6"/><path ' + S + ' d="M8.4 13.8h7.2M9.6 9.6h.01M14.4 9.6h.01"/>'),

    refresh:  box('<path ' + S + ' d="M20 12a8 8 0 1 1-2.34-5.66"/><path ' + S + ' d="M20 3.6V8.4h-4.8"/>'),
    calendar: box('<rect ' + S + ' x="3.6" y="5.4" width="16.8" height="14.2" rx="2"/><path ' + S + ' d="M3.6 9.8h16.8M8 3.6v3.4M16 3.6v3.4"/>'),
    logout:   box('<path ' + S + ' d="M14.6 4.4H6.8v15.2h7.8"/><path ' + S + ' d="M11.8 12h8.4m0 0-2.9-2.9m2.9 2.9-2.9 2.9"/>'),

    /* ---- 하단 탭바 ---- */
    tabCategory: box('<path ' + S + ' d="M3.6 6.6h16.8M3.6 12h16.8M3.6 17.4h16.8"/>'),
    tabBrand:    box('<path ' + S + ' d="M12.6 3.4H20v7.4l-8.8 8.8a1.6 1.6 0 0 1-2.2 0l-5.2-5.2a1.6 1.6 0 0 1 0-2.2z"/><circle fill="currentColor" cx="16.4" cy="7" r="1.1"/>'),
    tabHome:     box('<path ' + S + ' d="M3.8 10.6 12 4l8.2 6.6V20H3.8z"/><path ' + S + ' d="M9.6 20v-5.6h4.8V20"/>'),
    tabWish:     box('<path ' + S + ' d="M12 19.6 4.8 12.9a4.2 4.2 0 0 1 6-5.9l1.2 1.2 1.2-1.2a4.2 4.2 0 0 1 6 5.9z"/>'),
    tabMy:       box('<circle ' + S + ' cx="12" cy="8" r="3.4"/><path ' + S + ' d="M5.4 20a6.6 6.6 0 0 1 13.2 0"/>'),

    /* ---- SNS 브랜드 ---- */
    instagram: box('<rect ' + S + ' x="3.6" y="3.6" width="16.8" height="16.8" rx="5"/><circle ' + S + ' cx="12" cy="12" r="3.9"/><circle fill="currentColor" cx="16.9" cy="7.1" r="1.05"/>'),
    youtube:   box('<rect ' + S + ' x="2.6" y="5.6" width="18.8" height="12.8" rx="4"/><path fill="currentColor" d="M10.3 9.4v5.2l4.6-2.6z"/>'),
    tiktok:    box('<path ' + S + ' d="M14.2 3.4v10.9a3.6 3.6 0 1 1-3.6-3.6"/><path ' + S + ' d="M14.2 6.2a4.6 4.6 0 0 0 4.4 3.3"/>'),
    x:         box('<path ' + S + ' d="m4.4 4.4 15.2 15.2M19.6 4.4 4.4 19.6"/>')
  };

  /** 아이콘 이름으로 SVG 문자열을 반환 */
  function icon(name) {
    return ICONS[name] || '';
  }

  global.LFIcons = { map: ICONS, get: icon };
})(window);
