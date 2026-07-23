/* ============================================================
   신규가입 후 첫구매 미진행 고객 대상 개인화 APP PUSH 발송 — app.js (v2.1)
   1) 발송 RULE 타임라인 SVG 렌더링 — 깃발형 라벨(스태거)로 시인성 개선
   2) 세그먼트 분기 순서도(STEP 1~3) SVG 렌더링 — Y/N 분기 명시
   3) 프로세스 단계 선택 — 순서도 · 파이프라인 레일 · 상세 패널 동기화
   4) 네비게이션 스크롤 스파이
   5) 섹션 리빌 애니메이션
   6) 쿼리 토글
   ============================================================ */

(function () {
  'use strict';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ──────────────────────────────────────────────
     1. 발송 타임라인
     시간축: 전일 15:00(-9h) ~ 당일 24:00(+24h), 총 33시간
     겹침 방지 설계:
      - 주문확인 라벨칩 → 마커 '왼쪽 위' 깃발
      - 재검증 라벨칩  → 마커 '오른쪽 위' 깃발
      - 발송 라벨      → 마커 '아래'
     ────────────────────────────────────────────── */
  var TL = {
    W: 1160, H: 430,
    padL: 24, padR: 24,
    axisY: 48,
    hStart: -9,
    hEnd: 24
  };
  TL.scale = (TL.W - TL.padL - TL.padR) / (TL.hEnd - TL.hStart);
  function X(h) { return TL.padL + (h - TL.hStart) * TL.scale; }

  var BATCHES = [
    {
      name: '아침 배치',
      color: '#F5B14C',
      grad: 'url(#gAm)',
      baseY: 178,
      signup: { from: -9, to: 4, label: '가입 : 전일 15:00 ~ 당일 03:59 (13시간)' },
      check:  { at: 6,   label: '◆ 06:00 주문 확인',
                tip: '<b>주문 여부 확인 (06:00)</b><br>당일 06시까지 주문이 없는 회원만 발송 대상으로 추출합니다.' },
      verify: { at: 7.4, label: '✓ 07:5x 재검증',
                tip: '<b>발송 직전 재검증 (NEW)</b><br>추출~발송 사이(약 2시간)에 구매한 회원을 대상에서 제외해 오발송을 방지합니다.' },
      send:   { at: 8,   label: '08:00 PUSH 발송',
                tip: '<b>아침 배치 발송 (08:00)</b><br>세그먼트별 PUSH 동시 발송 — A: 가장 최근 본 상품 개인화 / B-1: 쿠폰 사용 유도 / B-2: 쿠폰 다운로드 유도. 야간 시간대(21~08시)를 피한 발송으로 야간 수신 동의 불필요.' },
      bandTip: '<b>아침 배치 가입 시간대</b><br>전일 15:00 ~ 당일 03:59 가입 회원 (13시간 구간).<br>이 구간 가입자는 당일 08시에 발송됩니다.'
    },
    {
      name: '저녁 배치',
      color: '#8B7CF6',
      grad: 'url(#gPm)',
      baseY: 330,
      signup: { from: 4, to: 15, label: '가입 : 당일 04:00 ~ 14:59 (11시간)' },
      check:  { at: 17,   label: '◆ 17:00 주문 확인',
                tip: '<b>주문 여부 확인 (17:00)</b><br>당일 17시까지 주문이 없는 회원만 발송 대상으로 추출합니다.' },
      verify: { at: 18.4, label: '✓ 18:5x 재검증',
                tip: '<b>발송 직전 재검증 (NEW)</b><br>추출~발송 사이(약 2시간)에 구매한 회원을 대상에서 제외해 오발송을 방지합니다.' },
      send:   { at: 19,   label: '19:00 PUSH 발송',
                tip: '<b>저녁 배치 발송 (19:00)</b><br>세그먼트별 PUSH 동시 발송 — A: 가장 최근 본 상품 개인화 / B-1: 쿠폰 사용 유도 / B-2: 쿠폰 다운로드 유도. 퇴근 시간대 발송으로 도달률 확보, 야간 수신 동의 불필요.' },
      bandTip: '<b>저녁 배치 가입 시간대</b><br>당일 04:00 ~ 14:59 가입 회원 (11시간 구간).<br>이 구간 가입자는 당일 19시에 발송됩니다.'
    }
  ];

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  /* 라벨칩 폭 추정 (한글/전각 11px, 영문/숫자 6.4px) */
  function chipW(t) {
    var w = 0;
    for (var i = 0; i < t.length; i++) {
      w += t.charCodeAt(i) > 0x2000 ? 11 : 6.4;
    }
    return Math.round(w) + 26;
  }

  /* 깃발형 라벨칩: 마커 위 지정 위치에 칩 + 마커까지 리더선 */
  function flagChip(x, baseY, text, color, align, tip) {
    var w = chipW(text), h = 26;
    var chipY = baseY - 62;
    var cx;
    if (align === 'left')  cx = x - w + 14;
    else                   cx = x - 14;
    cx = Math.max(4, Math.min(cx, TL.W - w - 4));

    var s = '';
    s += '<line x1="' + x + '" y1="' + (baseY - 10) + '" x2="' + x + '" y2="' + (chipY + h) +
         '" stroke="' + color + '" stroke-width="1.5" opacity=".55"/>';
    s += '<g class="tl-hit" data-tip="' + esc(tip) + '" style="cursor:help">';
    s += '<rect x="' + cx + '" y="' + chipY + '" width="' + w + '" height="' + h +
         '" rx="8" fill="#0F1522" stroke="' + color + '" stroke-width="1.5"/>';
    s += '<text x="' + (cx + w / 2) + '" y="' + (chipY + h / 2 + 4) +
         '" text-anchor="middle" font-size="11.5" font-weight="700" fill="' + color + '">' + esc(text) + '</text>';
    s += '</g>';
    return s;
  }

  function renderTimeline() {
    var host = document.getElementById('timeline-container');
    if (!host) return;

    var s = [];
    s.push('<svg id="timeline-svg" viewBox="0 0 ' + TL.W + ' ' + TL.H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="발송 타임라인: 아침 배치는 전일 15시부터 당일 3시59분 가입자 대상 당일 8시 발송, 저녁 배치는 당일 4시부터 14시59분 가입자 대상 당일 19시 발송">');

    s.push('<defs>' +
      '<linearGradient id="gAm" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#F5B14C" stop-opacity=".95"/><stop offset="1" stop-color="#F5B14C" stop-opacity=".45"/></linearGradient>' +
      '<linearGradient id="gPm" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#8B7CF6" stop-opacity=".95"/><stop offset="1" stop-color="#8B7CF6" stop-opacity=".45"/></linearGradient>' +
      '</defs>');

    /* ── 시간축 ── */
    s.push('<line x1="' + X(TL.hStart) + '" y1="' + TL.axisY + '" x2="' + X(TL.hEnd) + '" y2="' + TL.axisY + '" stroke="#242F45" stroke-width="2"/>');
    for (var h = TL.hStart; h <= TL.hEnd; h += 3) {
      var hh = ((h % 24) + 24) % 24;
      var lab = (hh < 10 ? '0' + hh : hh) + '시';
      if (h === 24) lab = '24시';
      s.push('<line x1="' + X(h) + '" y1="' + (TL.axisY - 5) + '" x2="' + X(h) + '" y2="' + (TL.axisY + 5) + '" stroke="#3A4a70" stroke-width="1.5"/>');
      s.push('<text x="' + X(h) + '" y="' + (TL.axisY - 14) + '" text-anchor="middle" font-size="11" fill="#8C96AB" font-family="JetBrains Mono,Consolas,monospace">' + lab + '</text>');
      s.push('<line x1="' + X(h) + '" y1="' + (TL.axisY + 5) + '" x2="' + X(h) + '" y2="' + (TL.H - 44) + '" stroke="#1A2338" stroke-width="1"/>');
    }

    /* 날짜 경계 (당일 00시) */
    s.push('<line x1="' + X(0) + '" y1="' + (TL.axisY - 34) + '" x2="' + X(0) + '" y2="' + (TL.H - 44) + '" stroke="#3A4a70" stroke-width="1.5" stroke-dasharray="5 5"/>');
    s.push('<text x="' + (X(0) - 10) + '" y="' + (TL.axisY - 36) + '" text-anchor="end" font-size="11.5" font-weight="700" fill="#8C96AB">◀ 전일 (D-1)</text>');
    s.push('<text x="' + (X(0) + 10) + '" y="' + (TL.axisY - 36) + '" text-anchor="start" font-size="11.5" font-weight="700" fill="#E8ECF4">당일 (D-day) ▶</text>');

    /* ── 배치 레인 ── */
    BATCHES.forEach(function (b) {
      var base = b.baseY, bh = 28;
      var x1 = X(b.signup.from), x2 = X(b.signup.to);
      var bandY = base - bh / 2;

      s.push('<line x1="' + X(TL.hStart) + '" y1="' + base + '" x2="' + X(TL.hEnd) + '" y2="' + base + '" stroke="#1E2940" stroke-width="1.5"/>');

      s.push('<text x="' + x1 + '" y="' + (bandY - 10) + '" font-size="13.5" font-weight="800" fill="' + b.color + '">' + esc(b.name) + '</text>');
      s.push('<text x="' + (x1 + 74) + '" y="' + (bandY - 10) + '" font-size="11.5" fill="#8C96AB">' + esc(b.signup.label) + '</text>');

      s.push('<rect class="tl-hit" data-tip="' + esc(b.bandTip) + '" x="' + x1 + '" y="' + bandY +
        '" width="' + (x2 - x1) + '" height="' + bh + '" rx="8" fill="' + b.grad + '" style="cursor:help"/>');
      s.push('<text x="' + ((x1 + x2) / 2) + '" y="' + (base + 4.5) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#0A0E16" pointer-events="none">👤 신규가입</text>');

      s.push('<line x1="' + x2 + '" y1="' + base + '" x2="' + (X(b.send.at) - 15) + '" y2="' + base +
        '" stroke="' + b.color + '" stroke-width="1.5" stroke-dasharray="3 5" opacity=".55"/>');

      /* ① 주문 확인 마커 (다이아몬드, 라벨은 왼쪽 위 깃발) */
      var cx = X(b.check.at);
      s.push(flagChip(cx, base, b.check.label, '#60A5FA', 'left', b.check.tip));
      s.push('<g class="tl-hit" data-tip="' + esc(b.check.tip) + '" style="cursor:help">' +
        '<rect x="' + (cx - 7) + '" y="' + (base - 7) + '" width="14" height="14" rx="3.5" transform="rotate(45 ' + cx + ' ' + base + ')" fill="#0A0E16" stroke="#60A5FA" stroke-width="2.5"/></g>');

      /* ② 재검증 마커 (체크 원, 라벨은 오른쪽 위 깃발) */
      var vx = X(b.verify.at);
      s.push(flagChip(vx, base, b.verify.label, '#4ADE80', 'right', b.verify.tip));
      s.push('<g class="tl-hit" data-tip="' + esc(b.verify.tip) + '" style="cursor:help">' +
        '<circle cx="' + vx + '" cy="' + base + '" r="7.5" fill="#0A0E16" stroke="#4ADE80" stroke-width="2.5"/>' +
        '<path d="M' + (vx - 3.2) + ' ' + base + ' l2.4 2.6 l4.2 -5" stroke="#4ADE80" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>');

      /* ③ 발송 마커 (라벨은 아래) */
      var sx = X(b.send.at);
      s.push('<g class="tl-hit" data-tip="' + esc(b.send.tip) + '" style="cursor:help">');
      if (!REDUCED) {
        s.push('<circle cx="' + sx + '" cy="' + base + '" r="14" fill="none" stroke="#F472B6" stroke-width="2" opacity=".8">' +
          '<animate attributeName="r" values="14;23;14" dur="2.4s" repeatCount="indefinite"/>' +
          '<animate attributeName="opacity" values=".8;0;.8" dur="2.4s" repeatCount="indefinite"/></circle>');
      }
      s.push('<circle cx="' + sx + '" cy="' + base + '" r="13" fill="#F472B6"/>' +
        '<text x="' + sx + '" y="' + (base + 4.5) + '" text-anchor="middle" font-size="12.5" pointer-events="none">📲</text>' +
        '<text x="' + sx + '" y="' + (base + 38) + '" text-anchor="middle" font-size="13" font-weight="800" fill="#F472B6">' + esc(b.send.label) + '</text></g>');
    });

    /* 커버리지 요약 */
    s.push('<text x="' + X(TL.hStart) + '" y="' + (TL.H - 12) + '" font-size="12" fill="#4ADE80" font-weight="700">✓ 두 배치의 가입 시간대 합계 13h + 11h = 24시간 전체 커버 — 발송 대상 누락 없음</text>');

    s.push('</svg>');
    host.innerHTML = s.join('');
    bindTooltip();
  }

  /* ── 툴팁 ── */
  function bindTooltip() {
    var tip = document.getElementById('tl-tooltip');
    if (!tip) return;
    var targets = document.querySelectorAll('.tl-hit');

    function move(e) {
      var pad = 16;
      var x = e.clientX + pad, y = e.clientY + pad;
      var r = tip.getBoundingClientRect();
      if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
      if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    }
    targets.forEach(function (el) {
      el.addEventListener('mouseenter', function () {
        tip.innerHTML = el.getAttribute('data-tip') || '';
        tip.classList.add('show');
      });
      el.addEventListener('mousemove', move);
      el.addEventListener('mouseleave', function () { tip.classList.remove('show'); });
    });
  }

  /* ──────────────────────────────────────────────
     2. 세그먼트 분기 순서도 (STEP 1~3, SVG)
     STEP1 수집 → ◇STEP2 상품상세 열람 이력?
       Y → 「마지막으로 본 상품 상세 재진입 유도 APP PUSH」
       N → ◇STEP3 신규가입 쿠폰 보유?
             Y → 「쿠폰 사용 유도 APP PUSH」
             N → 「쿠폰 다운로드 유도 APP PUSH」
     → 발송 대상 확정(STEP 4)으로 합류
     ────────────────────────────────────────────── */
  var FC_COL = {
    edge: '#3A4a70', arrow: '#5B677E',
    text: '#E8ECF4', muted: '#8C96AB',
    box: '#171F30', panel: '#111725',
    am: '#F5B14C', pm: '#8B7CF6', ok: '#4ADE80', info: '#60A5FA',
    pink: '#F472B6', danger: '#F87171'
  };

  function fcEdge(pts) {
    return '<polyline points="' + pts.map(function (p) { return p.join(','); }).join(' ') +
      '" fill="none" stroke="' + FC_COL.edge + '" stroke-width="2" marker-end="url(#fcArw)"/>';
  }
  function fcLine(x1, y1, x2, y2) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
      '" stroke="' + FC_COL.edge + '" stroke-width="2"/>';
  }
  /* Y/N 배지 + 설명 라벨 */
  function fcYN(x, y, yn, label, lx, ly, anchor) {
    var c = yn === 'Y' ? FC_COL.ok : FC_COL.danger;
    var dim = yn === 'Y' ? 'rgba(74,222,128,.15)' : 'rgba(248,113,113,.15)';
    var s = '<circle cx="' + x + '" cy="' + y + '" r="11" fill="' + dim + '" stroke="' + c + '" stroke-width="1.8"/>' +
      '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle" font-size="11.5" font-weight="800" fill="' + c + '" font-family="JetBrains Mono,Consolas,monospace">' + yn + '</text>';
    if (label) {
      s += '<text x="' + lx + '" y="' + ly + '" text-anchor="' + (anchor || 'start') +
        '" font-size="10.5" font-weight="700" fill="' + c + '">' + esc(label) + '</text>';
    }
    return s;
  }
  /* PUSH 결과 박스 (클릭 시 STEP 6 템플릿 상세) */
  function fcPushBox(y, cy, color, tag, t1, t2, sub) {
    var g = '<g class="fc-node" data-step="6" role="button" tabindex="0" aria-label="' + esc(tag + ' ' + t1 + ' ' + (t2 || '')) + '">' +
      '<rect class="fc-shape" x="620" y="' + y + '" width="280" height="76" rx="14" fill="' + FC_COL.panel + '" stroke="' + color + '" stroke-width="2"/>' +
      '<text x="638" y="' + (cy - 16) + '" font-size="10" font-weight="800" fill="' + color + '" font-family="JetBrains Mono,Consolas,monospace" letter-spacing="1">' + esc(tag) + '</text>';
    if (t2) {
      g += '<text x="638" y="' + (cy + 4) + '" font-size="12.5" font-weight="700" fill="' + FC_COL.text + '">' + esc(t1) + '</text>' +
           '<text x="638" y="' + (cy + 22) + '" font-size="12.5" font-weight="700" fill="' + FC_COL.text + '">' + esc(t2) + '</text>';
    } else {
      g += '<text x="638" y="' + (cy + 6) + '" font-size="12.5" font-weight="700" fill="' + FC_COL.text + '">' + esc(t1) + '</text>' +
           '<text x="638" y="' + (cy + 24) + '" font-size="9.5" fill="' + FC_COL.muted + '">' + esc(sub) + '</text>';
    }
    return g + '</g>';
  }

  function renderFlowchart() {
    var host = document.getElementById('flowchart-container');
    if (!host) return;

    var s = [];
    s.push('<svg id="flowchart-svg" viewBox="0 0 1160 590" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="세그먼트 분기 순서도: 상품상세 열람 이력이 있으면 상품 재진입 유도 푸시, 없으면 쿠폰 보유 시 사용 유도 푸시, 미보유 시 다운로드 유도 푸시">');
    s.push('<defs><marker id="fcArw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">' +
      '<path d="M0 0 L10 5 L0 10 z" fill="' + FC_COL.arrow + '"/></marker></defs>');

    /* ══ 간선 (도형보다 먼저 그려 도형이 위에 오도록) ══ */
    s.push(fcEdge([[175, 270], [213, 270]]));                                 /* S1 → D2 */
    s.push(fcEdge([[325, 206], [325, 113], [614, 113]]));                     /* D2 Y → A PUSH */
    s.push(fcEdge([[325, 334], [325, 455], [371, 455]]));                     /* D2 N → D3 */
    s.push(fcEdge([[595, 455], [607, 455], [607, 340], [614, 340]]));         /* D3 Y → B-1 PUSH */
    s.push(fcEdge([[485, 519], [485, 530], [614, 530]]));                     /* D3 N → B-2 PUSH */
    s.push(fcEdge([[900, 113], [938, 113]]));                                 /* A → 합류 */
    s.push(fcEdge([[900, 340], [938, 340]]));                                 /* B-1 → 합류 */
    s.push(fcEdge([[900, 530], [938, 530]]));                                 /* B-2 → 합류 */
    s.push(fcLine(940, 113, 940, 530));                                       /* 합류 세로선 */
    s.push(fcEdge([[940, 316], [956, 316]]));                                 /* 합류 → STEP4 */

    /* Y/N 배지 */
    s.push(fcYN(325, 162, 'Y', '상품상세 열람 이력 있음', 344, 166, 'start'));
    s.push(fcYN(325, 398, 'N', '열람 이력 없음', 344, 402, 'start'));
    s.push(fcYN(607, 398, 'Y', '쿠폰 보유', 624, 402, 'start'));
    s.push(fcYN(540, 530, 'N', '쿠폰 미보유', 540, 512, 'middle'));

    /* ══ STEP 1 — 발송 대상 수집 ══ */
    s.push('<g class="fc-node active" data-step="1" role="button" tabindex="0" aria-label="STEP 1 발송 대상 회원 수집">' +
      '<rect class="fc-shape" x="20" y="232" width="155" height="76" rx="12" fill="' + FC_COL.box + '" stroke="' + FC_COL.info + '" stroke-width="2"/>' +
      '<text x="97" y="254" text-anchor="middle" font-size="10" font-weight="800" fill="' + FC_COL.info + '" font-family="JetBrains Mono,Consolas,monospace" letter-spacing="1">STEP 1</text>' +
      '<text x="97" y="275" text-anchor="middle" font-size="13" font-weight="700" fill="' + FC_COL.text + '">발송 대상 수집</text>' +
      '<text x="97" y="293" text-anchor="middle" font-size="9.5" fill="' + FC_COL.muted + '">신규가입 · 미구매 · PUSH 동의</text></g>');

    /* ══ STEP 2 — ◇ 상품상세 열람 이력? ══ */
    s.push('<g class="fc-node" data-step="2" role="button" tabindex="0" aria-label="STEP 2 상품상세 열람 이력 판단">' +
      '<polygon class="fc-shape" points="215,270 325,206 435,270 325,334" fill="' + FC_COL.box + '" stroke="' + FC_COL.pm + '" stroke-width="2"/>' +
      '<text x="325" y="248" text-anchor="middle" font-size="10" font-weight="800" fill="' + FC_COL.pm + '" font-family="JetBrains Mono,Consolas,monospace" letter-spacing="1">STEP 2 · DW</text>' +
      '<text x="325" y="270" text-anchor="middle" font-size="13" font-weight="700" fill="' + FC_COL.text + '">상품상세 열람 이력?</text>' +
      '<text x="325" y="290" text-anchor="middle" font-size="9.5" fill="' + FC_COL.muted + '">행동 데이터 조회 (PAGE_ID=9 · PRODCD)</text></g>');

    /* ══ STEP 3 — ◇ 신규가입 쿠폰 보유? ══ */
    s.push('<g class="fc-node" data-step="3" role="button" tabindex="0" aria-label="STEP 3 신규가입 쿠폰 보유 판단">' +
      '<polygon class="fc-shape" points="375,455 485,391 595,455 485,519" fill="' + FC_COL.box + '" stroke="' + FC_COL.ok + '" stroke-width="2"/>' +
      '<text x="485" y="433" text-anchor="middle" font-size="10" font-weight="800" fill="' + FC_COL.ok + '" font-family="JetBrains Mono,Consolas,monospace" letter-spacing="1">STEP 3 · LFmall</text>' +
      '<text x="485" y="455" text-anchor="middle" font-size="13" font-weight="700" fill="' + FC_COL.text + '">신규가입 20% 쿠폰 보유?</text>' +
      '<text x="485" y="475" text-anchor="middle" font-size="9.5" fill="' + FC_COL.muted + '">쿠폰 발급/보유 테이블 확인</text></g>');

    /* ══ PUSH 결과 3종 ══ */
    s.push(fcPushBox(75, 113, FC_COL.am, 'SEG A · 상품 개인화',
      '📲 마지막으로 본 상품 상세', '재진입 유도 APP PUSH', ''));
    s.push(fcPushBox(302, 340, FC_COL.ok, 'SEG B-1 · 쿠폰 보유',
      '📲 쿠폰 사용 유도 APP PUSH', null, '랜딩: 쿠폰 적용 상품관'));
    s.push(fcPushBox(492, 530, FC_COL.info, 'SEG B-2 · 쿠폰 미보유',
      '📲 쿠폰 다운로드 유도 APP PUSH', null, '랜딩: 쿠폰 다운로드 페이지'));

    /* ══ 합류 → STEP 4 ══ */
    s.push('<g class="fc-node" data-step="4" role="button" tabindex="0" aria-label="STEP 4 발송 대상 확정 및 적재">' +
      '<rect class="fc-shape" x="958" y="270" width="184" height="92" rx="14" fill="' + FC_COL.box + '" stroke="' + FC_COL.am + '" stroke-width="2"/>' +
      '<text x="1050" y="296" text-anchor="middle" font-size="10" font-weight="800" fill="' + FC_COL.am + '" font-family="JetBrains Mono,Consolas,monospace" letter-spacing="1">STEP 4</text>' +
      '<text x="1050" y="318" text-anchor="middle" font-size="13" font-weight="700" fill="' + FC_COL.text + '">발송 대상 확정 · 적재</text>' +
      '<text x="1050" y="337" text-anchor="middle" font-size="9.5" fill="' + FC_COL.muted + '">세그먼트 태깅 (A / B-1 / B-2)</text>' +
      '<text x="1050" y="352" text-anchor="middle" font-size="9.5" fill="' + FC_COL.muted + '">↓ 아래 공통 파이프라인으로</text></g>');

    s.push('</svg>');
    host.innerHTML = s.join('');
  }

  /* ──────────────────────────────────────────────
     3. 프로세스 단계 선택 — 순서도(SVG) · 레일 · 패널 동기화
     ────────────────────────────────────────────── */
  function selectStep(step) {
    document.querySelectorAll('.pnode, .fc-node').forEach(function (el) {
      var on = el.getAttribute('data-step') === step;
      el.classList.toggle('active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.pd').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-pd') === step);
    });
  }

  function initProcess() {
    var targets = document.querySelectorAll('.pnode, .fc-node');
    if (!targets.length) return;
    targets.forEach(function (el) {
      el.addEventListener('click', function () {
        selectStep(el.getAttribute('data-step'));
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectStep(el.getAttribute('data-step'));
        }
      });
    });
  }

  /* ──────────────────────────────────────────────
     4. 스크롤 스파이
     ────────────────────────────────────────────── */
  function initScrollSpy() {
    var links = document.querySelectorAll('nav a[href^="#"]');
    var map = {};
    links.forEach(function (a) {
      var sec = document.querySelector(a.getAttribute('href'));
      if (sec) map[sec.id] = a;
    });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          links.forEach(function (a) { a.classList.remove('active'); });
          var a = map[en.target.id];
          if (a) a.classList.add('active');
        }
      });
    }, { rootMargin: '-35% 0px -55% 0px' });
    Object.keys(map).forEach(function (id) {
      obs.observe(document.getElementById(id));
    });
  }

  /* ──────────────────────────────────────────────
     5. 리빌 애니메이션
     ────────────────────────────────────────────── */
  function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (REDUCED) { els.forEach(function (el) { el.classList.add('on'); }); return; }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('on'); obs.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    els.forEach(function (el) { obs.observe(el); });
  }

  /* ──────────────────────────────────────────────
     6. 쿼리 토글
     ────────────────────────────────────────────── */
  function initQueryToggles() {
    document.querySelectorAll('.q-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var body = document.getElementById(btn.getAttribute('data-q'));
        if (!body) return;
        var open = body.classList.toggle('open');
        btn.textContent = open ? '쿼리 접기' : '쿼리 보기';
      });
    });
  }

  /* init */
  document.addEventListener('DOMContentLoaded', function () {
    renderTimeline();
    renderFlowchart();
    initProcess();
    initScrollSpy();
    initReveal();
    initQueryToggles();
  });
})();
