/* ============================================================
 * 어필리에이트 마케팅 정산 자동화 기획 — 데이터 정의
 *
 * 수기 업무(manuals) → 자동화 방안(autos) → 작업 범위(scopes)
 *  - 태스크 분해 기준: 1 업무 = 1 독립 산출물 (Dumas et al., BPMN 2.0)
 *    준비 행위는 별도 카드가 아니라 해당 업무의 세부 행위(steps)로 귀속
 *  - links : 왼쪽 항목 id 배열 (파이프라인 연결고리)
 *  - feas  : 'yes'(자동화 가능) | 'part'(부분 가능) | 'no'(불가) | 'exist'(기존 프로세스 활용)
 *  - 작업 대상 유형(type): web(WEB PAGE) | adminPage(ADMIN PAGE)
 *                        | adminFn(ADMIN FUNCTION) | if(INTERFACE)
 * ============================================================ */

const BOARD_DATA = {
  meta: {
    title: '어필리에이트 마케팅 정산 자동화 기획',
    subtitle: '수기 업무 → 자동화 방안 → 작업 범위 파이프라인 보드',
    version: 'v2.0 · 2026.07',
    account: '용역수수료(미디어커머스) 7219119 · 매장 E502/F871 · 전표마감 익월 10일 · 지급 익월 20일'
  },

  steps: [
    /* ─────────────────── STEP 01 ─────────────────── */
    {
      id: 's1', no: 'STEP 01', title: '계약 체결과 날인', freq: 'ONCE · 인플루언서별', color: '#6366f1',
      manuals: [
        { id: 'm1-1', title: 'SNS 채널 DM으로 인플루언서 섭외', outcome: '참여 의사 확인',
          desc: '컨텐츠본부 실무자가 인플루언서에게 SNS 메시지를 보내 LFmall 어필리에이트 마케팅 참여 의사를 확인' },
        { id: 'm1-2', title: '협찬·수수료·계약 방식 메신저 협의', outcome: '거래 조건 합의',
          desc: '제품 협찬 방식, 수수료 지급 방식, 계약 방식 등을 메신저로 개별 설명하고 협의' },
        { id: 'm1-3', title: '인플루언서 정보 수취 · 계약 날인', outcome: '크리에이터 정보 + 날인 계약서',
          steps: [
            '협의 완료된 인플루언서의 정보를 이메일로 수취 — 이메일 · 이름 · 활동명 · 관심 카테고리 · 연락처 · SNS 채널(다중) · 희망 원고료/수수료',
            '조건 확정 후 계약서 날인 진행'
          ] }
      ],
      autos: [
        { id: 'a1-1', feas: 'no', title: '인플루언서 섭외(DM)', desc: '휴먼 센싱이 필요한 영역 — 관계 기반 커뮤니케이션으로 자동화 대상에서 제외', links: ['m1-1'] },
        { id: 'a1-2', feas: 'yes', title: '사전 안내 화면 표준화', desc: '제품 협찬 방식 · 수수료 지급 방식 · 계약 방식을 표준 안내 페이지로 제공 → 메신저 반복 설명 제거', links: ['m1-2'] },
        { id: 'a1-3', feas: 'yes', title: '[1안] 크리에이터 등록 신청 + NBOS 승인', desc: 'LFmall에 크리에이터 등록 화면을 만들어 인플루언서가 셀프 입력 → 컨텐츠본부가 NBOS에서 승인 (무신사 큐레이터 신청 구조 참고)', links: ['m1-3'] },
        { id: 'a1-4', feas: 'part', title: '[2안·경량] 신청 정보 이메일 전달', desc: 'Admin 화면 개발은 시간이 오래 걸리므로, 신청 정보가 실무자 이메일로 전달되는 구조를 이중 제안', links: ['m1-3'] }
      ],
      scopes: [
        { id: 'w1-1', title: '사전 안내 랜딩 페이지', proto: 'proto-precontract', links: ['a1-2'],
          groups: [
            { type: 'web', items: ['협찬 방식 / 수수료 / 계약 절차 안내 콘텐츠 페이지', 'FAQ · 신청 버튼 연결 · 모바일 대응'] }
          ] },
        { id: 'w1-2', title: '크리에이터 등록 신청 + NBOS 승인 화면', alt: '1안', altNote: 'w1-3(2안)과 택일', proto: 'proto-apply', proto2: 'proto-nbos-approve', links: ['a1-3'],
          groups: [
            { type: 'web', items: ['신청 폼: 사업자 유무에 따른 입력 분기(사업자번호/주민번호)', '파일 업로드: 사업자등록증 · 날인 계약서 · 통장사본', '개인정보 수집 동의 화면 · 중복 신청 체크'] },
            { type: 'adminPage', items: ['NBOS 신청 목록/검색/상세/승인 화면 (권한 분리)'] },
            { type: 'adminFn', items: ['상태값 관리: 신청→검토→승인→거래선등록완료 / 반려(사유 통보)', '고유식별정보(주민번호·계좌) 암호화 저장 / 마스킹 표시', '계좌 · 사업자번호 검증 룰 · 조회 이력 로깅'] }
          ] },
        { id: 'w1-3', title: '[대안] 이메일 접수 구조', alt: '2안', altNote: 'w1-2(1안)와 택일', proto: 'proto-email', links: ['a1-4'],
          groups: [
            { type: 'web', items: ['간이 신청 폼 (Admin 개발 없이 접수만)'] },
            { type: 'adminFn', items: ['실무자 메일 자동 발송 템플릿'] }
          ] }
      ]
    },

    /* ─────────────────── STEP 02 ─────────────────── */
    {
      id: 's2', no: 'STEP 02', title: '거래선 등록', freq: 'ONCE · 인플루언서별', color: '#0ea5e9',
      manuals: [
        { id: 'm2-1', title: '거래선 등록 (PLAS 수기)', outcome: '인플루언서별 거래선코드',
          steps: [
            '사업자 유무 확인 → 거래선 유형 결정: 사업자 없음 → 원천세 거래선(사업소득, 3.3% 공제) / 사업자 있음 → 기타거래처(세금계산서) — 유형을 잘못 만들면 그 달 정산이 통째로 밀리는 최다 오류 지점',
            'LFon > PLAS 접속, 결정된 유형으로 정산 정보 수기 입력',
            '인플루언서별 거래선코드 발급 확인'
          ] }
      ],
      autos: [
        { id: 'a2-1', feas: 'exist', title: '기존 거래선 자동화 프로세스 응용', desc: '입점업체는 이미 NBOS 입점업체정보 → [전송] → SAP → 회계BSU 승인 → 거래선코드 생성 → NBOS 자동 업데이트 구조 운영 중. 크리에이터에 동일 구조를 적용하면 유형 분기 판단과 수기 입력이 함께 흡수됨', links: ['m2-1'] }
      ],
      scopes: [
        { id: 'w2-1', title: 'NBOS 크리에이터 정보 화면 + [자료 전송]', proto: 'proto-nbos-transfer', links: ['a2-1'], depends: 'STEP 01 Admin(w1-2) 개발 선행 필수',
          groups: [
            { type: 'adminPage', items: ['크리에이터 등록 정보 조회 화면 (입점업체정보 팝업 구조 준용)'] },
            { type: 'adminFn', items: ['[자료 전송] 처리 로직 → 거래선코드 취득 · 크리에이터 정보 반영'] },
            { type: 'if', items: ['NBOS ↔ SAP 인터페이스 정의서 작성 · 전송 개발'] }
          ] }
      ]
    },

    /* ─────────────────── STEP 03 ─────────────────── */
    {
      id: 's3', no: 'STEP 03', title: '정산 기안(품의) 작성', freq: 'MONTHLY', color: '#f59e0b',
      manuals: [
        { id: 'm3-1', title: '매월 정산 기안서 작성 · 상신', outcome: '결재 완료된 품의(기안번호)',
          desc: '전결규정상 통 기안 불가 → 매달 그 달 정산분 기안 필수',
          steps: [
            '판매기간 정산 데이터 정리 (인플루언서명 · 채널 · 진행 방식 포함)',
            '기안서 작성 · 상신 → 결재 완료',
            '기안번호 확보 — STEP 04 전표 생성 시 입력 항목으로 사용'
          ] }
      ],
      autos: [
        { id: 'a3-1', feas: 'no', title: '기안서 작성 자체', desc: 'LFon Portal 고유 기능으로 자동화 이력 없음 + 전결규정상 매월 별도 기안이 필수라 프로세스 자체를 생략 불가', links: ['m3-1'] },
        { id: 'a3-3', feas: 'yes', title: '전표상 기안번호 입력 생략', desc: 'STEP 04가 자동화되어 SAP 자동 전송 전표 프로세스가 도입될 경우, 전표 생성 시 기안번호를 수기 입력하는 행위는 생략 가능 (별도 개발 없이 STEP 04 자동화의 파생 효과)', links: ['m3-1'] }
      ],
      scopes: []
    },

    /* ─────────────────── STEP 04 ─────────────────── */
    {
      id: 's4', no: 'STEP 04', title: 'PLAS 전표 입력', freq: 'MONTHLY · 익월 10일 마감', color: '#10b981',
      manuals: [
        { id: 'm4-1', title: '인플루언서별 대금 지급 전표 생성', outcome: '회계BSU 승인 전표 → 대금 지급',
          desc: '인플루언서 1명당 PLAS 전표 1건 수기 생성 — 10명 지급 시 전표 10건',
          steps: [
            '사업자 유무 · 세금계산서 발행 주체 확인 → 케이스 결정: ① 개인·원천세 / ② 사업자·계산서 수취 / ③ 사업자·LF 발행',
            '케이스별 전표 항목 입력 — 거래일자 상이(①말일 / ②계산서 작성일 / ③익월 1일) + 고정값(계정 7219119 · 매장 E502/F871 · 현금기타 · 지급예정일 익월 20일) + 기안번호',
            '첨부파일 첨부 — 정산 데이터 (사업자 건은 세금계산서 포함)',
            '익월 10일 내 입력 완료 → 회계BSU 승인 → 대금 지급 (케이스 ③은 마감 초과 시 세무 이슈, 지연 예상 시 사전 연락)'
          ] }
      ],
      autos: [
        { id: 'a4-1', feas: 'yes', title: 'SAP 자동 전송 전표 BATCH', desc: '입점사 판매대금은 이미 매월 첫영업일 SAP 자동 전송 전표 프로세스 운영 중 → 크리에이터 수수료 지급용 전표 BATCH 신규 개발로 준용. 케이스 판단 · 항목 입력 · 첨부 · 마감 관리가 배치로 흡수됨', links: ['m4-1'] },
        { id: 'a4-2', feas: 'part', title: '케이스별 정산 방식 차이 대응', desc: '사업자 보유 여부에 따라 정산 방식(원천세 3.3% vs 세금계산서)이 달라 SAP 자동 전송 전표 프로세스를 만들지 못할 가능성도 있음 — 전송할 전표의 항목 정의가 선행되어야 함', links: ['m4-1'] }
      ],
      scopes: [
        { id: 'w4-1', title: '전표 전송 BATCH 신규 개발', proto: 'proto-batch', links: ['a4-1', 'a4-2'], depends: 'ICT운영BSU + LG CNS 협업 필요 · 전송 전표 항목 정의 선행',
          groups: [
            { type: 'if', items: ['전표 전송 BATCH 신규 개발 (기존 입점사 프로세스 준용)', '전송 전표 항목 정의서 — 케이스 ①②③별 작성 (거래일자: ①말일/②계산서 작성일/③익월 1일)'] },
            { type: 'adminFn', items: ['고정값 자동 세팅 룰: 계정 7219119 · 매장 E502/F871 · 현금기타 · 익월 20일 · 섹션코드 · 기안번호'] }
          ] }
      ]
    },

    /* ─────────────────── STEP 05 ─────────────────── */
    {
      id: 's5', no: 'STEP 05', title: '손익배부', freq: 'MONTHLY', color: '#ec4899',
      manuals: [
        { id: 'm5-1', title: '배부 대량전표 CSV 작성 · 업로드', outcome: 'BPU별 배부 전표 반영',
          steps: [
            '온라인사업부(손익센터 30059) 계상 비용에서 배부 대상 금액 확인',
            'CSV 작성 — 형식 엄수: A열 전표구분 순번 · B열 T/L 구분, PK50 대변 = PK40 차변 합계 일치',
            '대량전표 업로드'
          ] },
        { id: 'm5-2', title: '매월 배부율 · BPU 변동 관리', outcome: '당월 배부 기준표',
          desc: '매월 브랜드사업부 BPU와 배부율에 변동 발생 가능 → 현재는 담당자가 엑셀로 개별 관리' }
      ],
      autos: [
        { id: 'a5-1', feas: 'yes', title: 'BPU 자동 배부 기능', desc: '인플루언서에게 지급되는 비용을 배부할 브랜드사업부 내 BPU를 인식하고 자동 배부되는 기능을 NBOS에 신설', links: ['m5-1'] },
        { id: 'a5-2', feas: 'yes', title: '배부율 관리 화면', desc: '매월 BPU와 배부율 변동을 관리할 수 있는 배부율 관리 화면을 NBOS에 신설', links: ['m5-2'] },
        { id: 'a5-3', feas: 'part', title: 'SAP 자동 전송 전표 확장', desc: '위 제반사항이 모두 개발되면 배부 전표까지 SAP 자동 전송 전표를 개발할 수 있으나, ICT운영BSU + LG CNS 협업 필요', links: ['m5-1'] }
      ],
      scopes: [
        { id: 'w5-1', title: 'NBOS 배부율 관리 + CSV 자동 생성', proto: 'proto-allocation', links: ['a5-1', 'a5-2'],
          groups: [
            { type: 'adminPage', items: ['배부율 관리 화면: 월별 버전 관리 · BPU 추가/삭제 · 합계 100% 검증 · 변경 이력'] },
            { type: 'adminFn', items: ['배부 전표 CSV 자동 생성 (헤더 T + 대변 PK50 + 차변 PK40)', '차변 합계 = 대변 자동 검증 · 원단위 끝수 차이 처리 룰'] }
          ] },
        { id: 'w5-2', title: '배부 전표 SAP 자동 전송 확장', links: ['a5-3'], depends: 'ICT운영BSU + LG CNS 협업 필요',
          groups: [
            { type: 'if', items: ['배부 전표 SAP 자동 전송 I/F 개발', '전송 결과 모니터링 · 실패 재처리'] }
          ] }
      ]
    }
  ]
};

/* ============================================================
 * 작업 대상 유형 정의 (IFPUG 기능점수의 트랜잭션/연계 구분 준용)
 * ============================================================ */
const SCOPE_TYPES = {
  web:       { label: 'WEB PAGE',       icon: '🌐', color: '#2563eb', unit: '화면', desc: '크리에이터에게 노출되는 프론트 화면' },
  adminPage: { label: 'ADMIN PAGE',     icon: '🖥️', color: '#7c3aed', unit: '화면', desc: 'NBOS 관리 화면 (조회 · 승인 · 관리 UI)' },
  adminFn:   { label: 'ADMIN FUNCTION', icon: '⚙️', color: '#d97706', unit: '기능', desc: '화면 뒤 처리 기능 · 로직 (상태 관리, 검증, 암호화, 생성 · 발송)' },
  if:        { label: 'INTERFACE',      icon: '🔗', color: '#0d9488', unit: '연동', desc: '시스템 간 연동 (NBOS↔SAP 전송 · 전표 BATCH)' }
};

/* ============================================================
 * APPENDIX — 단계별 자동화 로드맵 (마일스톤)
 * ============================================================ */
BOARD_DATA.roadmap = {
  intro: '개발 대상 규모(화면·기능·연동 개수)와 리드타임, 정산 대상 규모를 기준으로 착수 순서를 나눴습니다. 규모가 작은 동안은 수기 처리가 개발보다 효율적인 구간을 수기로 유지하고, 인원이 늘어 병목·오류 리스크가 커지는 시점에 단계적으로 시스템화합니다.',
  phases: [
    {
      no: 'PHASE 0', name: '수기 운영 체계 정비', trigger: '지금 즉시 · 개발 리소스 0', color: '#94a3b8',
      works: [],
      manual: [
        '메뉴얼 기반 수기 운영: 계약·날인 → PLAS 거래선 수기 등록 → 월별 기안 → 전표 개별 입력 → 배부 CSV',
        '표준 양식 정착: 기안 템플릿 · 전표처리 안내 · 배부 CSV 샘플 (메뉴얼 첨부 양식 5종 활용)',
        '사전 안내문 1종 표준화(문서) → 메신저 반복 설명 축소 (랜딩 페이지 개발 전 임시)'
      ],
      why: '정산 대상이 소수인 동안은 건당 수기 처리 부담이 낮아, 개발 비용보다 수기 운영이 효율적'
    },
    {
      no: 'PHASE 1', name: '접수 채널 경량 자동화', trigger: '크리에이터 모집 정례화 시', color: '#0d9488',
      works: [
        { ref: 'W1-1', scale: '화면 2', text: '사전 안내 랜딩 페이지 — 협찬·수수료·계약 안내 표준화' },
        { ref: 'W1-3', scale: '화면 1 · 기능 1', text: '[2안] 이메일 접수 구조 — Admin 개발 없이 신청 폼 → 실무자 메일 전달' }
      ],
      manual: ['거래선 등록 · 기안 · 전표 입력 · 손익배부는 수기 유지'],
      why: '소규모 화면 2건만으로 섭외~정보 취합이 표준화됨. Admin 개발 없이 빠르게 적용 가능한 최소 자동화'
    },
    {
      no: 'PHASE 2', name: '운영 기반 시스템화', trigger: '정산 대상 월 20명 이상', color: '#4f46e5',
      works: [
        { ref: 'W1-2', scale: '화면 4 · 기능 3', text: '크리에이터 등록 신청 + NBOS 승인 화면 — 이메일 접수(1단계)를 정식 구조로 대체' },
        { ref: 'W2-1', scale: '화면 1 · 기능 1 · 연동 1', text: 'NBOS 크리에이터 정보 + [자료 전송] → 거래선코드 자동 발급 (W1-2 선행 필수)' },
        { ref: 'W5-1', scale: '화면 1 · 기능 2', text: 'NBOS 배부율 관리 + 배부 CSV 자동 생성' }
      ],
      manual: ['기안 · 전표 입력은 수기 유지 (전표 20건/월 수준까지는 수기 감내 가능)'],
      why: '인원 20명부터 거래선 수기 등록량과 유형(원천세/기타거래처) 오분류 리스크가 급증 — 오류 다발 구간(거래선)과 반복 구간(배부)을 대형 연동 개발 없이 우선 해소'
    },
    {
      no: 'PHASE 3', name: '전표 완전 자동화', trigger: '월 20명 이상 정례화 + 전표 입력 병목 시', color: '#10b981',
      works: [
        { ref: 'W4-1', scale: '기능 1 · 연동 2', text: '전표 전송 BATCH 신규 개발 — 케이스별 항목 정의 + ICT운영BSU·LG CNS 협업' },
        { ref: 'W5-2', scale: '연동 2', text: '배부 전표 SAP 자동 전송 확장' }
      ],
      manual: ['기안 작성은 전결규정상 계속 수기 (단, 전표상 기안번호 입력은 생략됨)'],
      why: '외부 협업과 전표 항목 정의가 필요해 리드타임이 가장 긴 과제 — 인원·건수가 실제 병목을 만드는 시점에 착수해야 투자 대비 효과가 확실'
    }
  ]
};

/* ============================================================
 * 프로토타입 목업 화면 (화면보기 팝업)
 * ============================================================ */
const PROTOS = {
  'proto-precontract': {
    title: '사전 안내 랜딩 페이지 (WEB PAGE · LFmall)',
    html: `
    <div class="mock-front">
      <div class="mock-gnb"><b>LF</b>mall <span>WOMEN · MEN · BEAUTY · LIVING</span><em>로그인 · 장바구니</em></div>
      <div class="mock-hero">
        <p class="mock-hero-tag">LFmall CREATOR</p>
        <h3>나의 콘텐츠로 수익을 만드는<br>LFmall 어필리에이트 크리에이터</h3>
        <p class="mock-hero-sub">내 SNS에 상품 링크를 걸고, 판매액의 약정 수수료를 매월 정산받으세요.</p>
        <button class="mock-cta">크리에이터 신청하기</button>
      </div>
      <div class="mock-3col">
        <div><b>① 제품 협찬</b><p>협업 제품을 제공받고 콘텐츠를 제작합니다.</p></div>
        <div><b>② 수수료 지급</b><p>링크 경유 판매액 × 계약 수수료율.<br>매월 확정 → 익월 20일 지급.</p></div>
        <div><b>③ 계약 방식</b><p>전자계약 체결 · 개인은 원천세 3.3% 공제,<br>사업자는 세금계산서 발행.</p></div>
      </div>
      <div class="mock-faq"><b>자주 묻는 질문</b><p>Q. 정산은 언제 되나요? — 판매월 확정 후 익월 20일 지급됩니다.</p><p>Q. 사업자가 없어도 되나요? — 네, 개인(프리랜서)도 참여 가능합니다.</p></div>
    </div>`
  },
  'proto-apply': {
    title: '크리에이터 등록 신청 화면 (WEB PAGE · 무신사 큐레이터 참고)',
    html: `
    <div class="mock-front">
      <div class="mock-gnb"><b>LF</b>mall <span>크리에이터 가입 신청</span></div>
      <div class="mock-form">
        <div class="mock-row"><label>이름 *</label><input placeholder="실명 입력"></div>
        <div class="mock-row"><label>활동명 *</label><input placeholder="채널에서 쓰는 이름"></div>
        <div class="mock-row"><label>이메일 *</label><input placeholder="example@email.com"></div>
        <div class="mock-row"><label>연락처 *</label><input placeholder="010-0000-0000"></div>
        <div class="mock-row"><label>관심 카테고리 *</label><div class="mock-chips"><span class="on">여성패션</span><span>남성패션</span><span class="on">뷰티</span><span>리빙</span><span>골프</span></div></div>
        <div class="mock-row"><label>SNS 채널 *</label>
          <div class="mock-multi"><input value="https://instagram.com/..."><button>−</button></div>
          <div class="mock-multi"><input value="https://youtube.com/@..."><button>−</button></div>
          <button class="mock-add">+ 채널 추가</button></div>
        <div class="mock-row"><label>희망 원고료 / 수수료 *</label><input placeholder="예) 원고료 50만원 · 수수료 25%"></div>
        <div class="mock-row"><label>사업자 여부 *</label><div class="mock-chips"><span class="on">개인 (원천세 3.3%)</span><span>사업자 (세금계산서)</span></div></div>
        <div class="mock-row"><label>첨부 서류 *</label>
          <div class="mock-file">📎 신분증/사업자등록증 사본 <em>파일 선택</em></div>
          <div class="mock-file">📎 통장 사본 <em>파일 선택</em></div></div>
        <div class="mock-agree">☑ 개인정보 수집·이용 동의 (필수) &nbsp; ☑ 고유식별정보 처리 동의 (필수)</div>
        <button class="mock-cta wide">가입 신청하기</button>
      </div>
    </div>`
  },
  'proto-email': {
    title: '[대안 · 2안] 신청 정보 이메일 전달 구조 (ADMIN FUNCTION · MAIL)',
    html: `
    <div class="mock-mail">
      <div class="mock-mail-head">
        <p><b>받는사람</b> 컨텐츠본부 실무자 &lt;creator@lfmall.co.kr&gt;</p>
        <p><b>제목</b> [크리에이터 신청] 김리프 (@leaf_style) — 2026-07-24</p>
      </div>
      <div class="mock-mail-body">
        <table>
          <tr><th>이름</th><td>김리프</td><th>활동명</th><td>@leaf_style</td></tr>
          <tr><th>이메일</th><td>leaf@email.com</td><th>연락처</th><td>010-****-1234</td></tr>
          <tr><th>카테고리</th><td>여성패션 · 뷰티</td><th>사업자</th><td>개인 (원천세 3.3%)</td></tr>
          <tr><th>SNS</th><td colspan="3">instagram.com/leaf_style · youtube.com/@leafstyle</td></tr>
          <tr><th>희망 조건</th><td colspan="3">원고료 50만원 · 수수료 25%</td></tr>
        </table>
        <p class="mock-lock">📎 첨부: 신청 서류.zip</p>
      </div>
    </div>`
  },
  'proto-nbos-approve': {
    title: 'NBOS 크리에이터 신청 승인 화면 (ADMIN PAGE)',
    html: `
    <div class="mock-admin">
      <div class="mock-admin-bar">NBOS &gt; 크리에이터관리 &gt; 신청 승인</div>
      <div class="mock-filter"><span>상태: 전체 ▾</span><span>사업자: 전체 ▾</span><input placeholder="이름/활동명 검색"><button>조회</button></div>
      <table class="mock-table">
        <tr><th>신청일</th><th>이름</th><th>활동명</th><th>사업자</th><th>서류</th><th>상태</th><th>처리</th></tr>
        <tr><td>07-24</td><td>김리프</td><td>@leaf_style</td><td>개인</td><td>✓ 2건</td><td><i class="st y">검토중</i></td><td><button class="ok">승인</button><button class="no">반려</button></td></tr>
        <tr><td>07-23</td><td>박스타일</td><td>@park_ootd</td><td>사업자</td><td>✓ 3건</td><td><i class="st g">승인</i></td><td><button disabled>완료</button></td></tr>
        <tr><td>07-22</td><td>이코디</td><td>@codi_e</td><td>개인</td><td>⚠ 1건 누락</td><td><i class="st r">반려</i></td><td><button>재요청</button></td></tr>
      </table>
      <p class="mock-note">승인 시 크리에이터 정보 확정 → STEP 02 거래선 전송 대상으로 전환</p>
    </div>`
  },
  'proto-nbos-transfer': {
    title: 'NBOS 크리에이터 정보 · 거래선 [자료 전송] (ADMIN PAGE + INTERFACE)',
    html: `
    <div class="mock-admin">
      <div class="mock-admin-bar red">크리에이터 정보 수정</div>
      <table class="mock-kv">
        <tr><th>활동명</th><td>@leaf_style</td><th>연락처</th><td>010-****-1234</td></tr>
        <tr><th>사업자 여부</th><td>개인 → <b>원천세 거래선 (사업소득)</b></td><th>수수료율</th><td>25%</td></tr>
        <tr><th>계좌</th><td>국민 ***-**-1234</td><th>서류</th><td>신분증 ✓ · 통장사본 ✓ · 계약서 날인본 ✓</td></tr>
      </table>
      <div class="mock-flow"><span>① NBOS [전송]</span>→<span>② SAP 수신</span>→<span>③ 회계BSU 검토·승인</span>→<span class="hl">④ 거래선코드 생성 · NBOS 업데이트</span></div>
      <div class="mock-btns"><button>취소</button><button class="save">저장</button><button class="send">전송</button></div>
    </div>`
  },
  'proto-batch': {
    title: 'SAP 자동 전송 전표 BATCH 모니터링 (INTERFACE + ADMIN FUNCTION)',
    html: `
    <div class="mock-admin">
      <div class="mock-admin-bar">NBOS &gt; 정산관리 &gt; 전표 배치 모니터링 — 2026년 07월 정산분</div>
      <div class="mock-stats"><div><b>18</b><span>대상 크리에이터</span></div><div><b>16</b><span>전표 생성 완료</span></div><div class="warn"><b>1</b><span>대기</span></div><div class="err"><b>1</b><span>전송 실패</span></div></div>
      <table class="mock-table">
        <tr><th>크리에이터</th><th>케이스</th><th>정산액</th><th>원천세</th><th>지급액</th><th>기안번호</th><th>상태</th></tr>
        <tr><td>@leaf_style</td><td>① 개인</td><td>1,240,000</td><td>40,920</td><td>1,199,080</td><td>LF-0712</td><td><i class="st g">전송 완료</i></td></tr>
        <tr><td>@park_ootd</td><td>② 사업자·수취</td><td>2,860,000</td><td>—</td><td>3,146,000</td><td>LF-0712</td><td><i class="st y">대기</i></td></tr>
        <tr><td>@codi_e</td><td>① 개인</td><td>530,000</td><td>17,490</td><td>512,510</td><td>LF-0713</td><td><i class="st r">전송 실패 · 재처리</i></td></tr>
      </table>
      <p class="mock-note">고정값 자동 세팅: 계정 7219119 · 매장 E502/F871 · 지급조건 현금기타 · 지급예정일 08-20</p>
    </div>`
  },
  'proto-allocation': {
    title: 'NBOS 배부율 관리 + 배부 전표 CSV 자동 생성 (ADMIN PAGE + ADMIN FUNCTION)',
    html: `
    <div class="mock-admin">
      <div class="mock-admin-bar">NBOS &gt; 정산관리 &gt; 손익 배부율 관리 — 2026년 07월 <em>(전월 복사 ▾)</em></div>
      <table class="mock-table">
        <tr><th>손익센터(BPU)</th><th>배부 기준</th><th>배부율</th><th>배부액</th></tr>
        <tr><td>30059 온라인사업부 (대변 PK50)</td><td>—</td><td>100%</td><td>-4,630,000</td></tr>
        <tr><td>31021 헤지스 BPU (차변 PK40)</td><td>고정율</td><td><input class="mini" value="40"></td><td>1,852,000</td></tr>
        <tr><td>31035 닥스 BPU (차변 PK40)</td><td>고정율</td><td><input class="mini" value="35"></td><td>1,620,500</td></tr>
        <tr><td>31047 아떼 BPU (차변 PK40)</td><td>고정율</td><td><input class="mini" value="25"></td><td>1,157,500</td></tr>
      </table>
      <div class="mock-check"><b>자동 검증</b><p>✓ 배부율 합계 100% &nbsp; ✓ 차변 합계 = 대변 (4,630,000)</p></div>
      <div class="mock-btns"><button>변경 이력</button><button class="save">저장</button><button class="send">배부 CSV 생성 ↓</button></div>
    </div>`
  }
};
