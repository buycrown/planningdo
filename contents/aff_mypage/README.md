# LFmall 마이페이지 — 어필리에이트 서비스 활동 내역 (POC)

LFmall 마이페이지에 **'어필리에이트 서비스 활동 내역'** 메뉴를 신설하고,
메뉴 진입 시의 하위 화면을 구성한 시연용 프로토타입입니다.

- 대상 회원 : 어필리에이트 마케팅 서비스 신청(= 인플루언서 가입 신청) 승인 회원
- 화면 규격 : **iPhone 12 Pro (390 × 844)** — 임원보고 시연용 디바이스 프레임 포함
- 기술 스택 : Vanilla HTML / CSS / JS (빌드 도구·프레임워크 없음, GitHub Pages 즉시 배포 가능)

---

## 1. 화면 구성

| 파일 | 화면 | 설명 |
|---|---|---|
| `index.html` | 마이페이지 | '나의 패션 클럽' **하단**에 신규 메뉴 추가 (NEW 뱃지) |
| `affiliate.html` | 어필리에이트 서비스 활동 내역 | 총 수익 대시보드 + 서브 메뉴 4종 |
| `links.html` | 내 링크 확인하기 | LF 담당자가 지급한 링크 내역 · 복사 · 등록일 · 활성/종료 |
| `revenue.html` | 수익 현황 | 달별 발생 수익 (금액 · 누적 대비 비중 · 막대 그래프) |
| `creator.html` | 크리에이터 정보 | 가입 신청 시 입력한 정보 + 정산 조건(판매 수수료 5%) |
| `terms.html` | 이용약관 | 가입 시 동의한 이용약관 / 운영정책 |
| `withdraw.html` | 서비스 탈퇴하기 | 안내 → 사유 선택 → 확인 모달 → 완료 |

### 화면 이동 흐름

```
index.html (마이페이지)
   └─ 어필리에이트 서비스 활동 내역  →  affiliate.html
                                        ├─ 수익 현황 보러가기   → revenue.html
                                        ├─ 내 링크 확인하기 [8] → links.html
                                        ├─ 크리에이터 정보      → creator.html
                                        ├─ 이용약관            → terms.html
                                        └─ 서비스 탈퇴하기      → withdraw.html
                                                                 └─ 탈퇴 완료 → index.html (메뉴 미노출)
```

---

## 2. 파일 구조

```
LFmall_어필리에이트_활동내역/
├── index.html            마이페이지
├── affiliate.html        어필리에이트 서비스 활동 내역
├── links.html            내 링크 확인하기
├── revenue.html          수익 현황
├── creator.html          크리에이터 정보
├── terms.html            이용약관
├── withdraw.html         서비스 탈퇴하기
├── css/
│   ├── base.css          디자인 토큰 · 디바이스 프레임 · 헤더 · 메뉴 리스트 · 모달 · 토스트
│   ├── mypage.css        마이페이지 상단 요약 영역
│   └── affiliate.css     어필리에이트 화면 전용 스타일
├── js/
│   ├── icons.js          인라인 SVG 아이콘 세트 (외부 이미지 의존 없음)
│   ├── data.js           더미 데이터 + 상태 저장소 (API 연동 지점)
│   ├── common.js         공통 렌더러 (상태바/앱바/탭바/모달/토스트/포맷)
│   ├── mypage.js         마이페이지 화면 로직
│   ├── affiliate.js      활동 내역 화면 로직
│   ├── links.js          내 링크 확인 화면 로직
│   ├── revenue.js        수익 현황 화면 로직
│   ├── creator.js        크리에이터 정보 화면 로직
│   ├── terms.js          이용약관 화면 로직
│   └── withdraw.js       탈퇴 화면 로직
└── README.md
```

---

## 3. 디자인 토큰

실제 `m.lfmall.co.kr` 마이페이지의 렌더링 값을 그대로 추출해 적용했습니다.

| 항목 | 값 | 비고 |
|---|---|---|
| 폰트 | `Pretendard` (14px, `letter-spacing -0.3px`) | LFmall 기본 서체 |
| 텍스트 | `#000` / 보조 `#888` | |
| 포인트 | `#D9232E` | 뱃지·강조 |
| 구분선 | `1px solid #EEEEEE` | 메뉴 행 사이 |
| 메뉴 행 | `height 56px`, `padding-left 53px` | LFmall 원본 수치 |
| 아이콘 | `40 × 40` 슬롯 @ `left 10px`, 글리프 24px | 원본은 스프라이트, 본 POC는 인라인 SVG |
| 우측 화살표 | `22 × 22` @ `right 11px` | |
| 라운드 | `2px` | |

### 신규 메뉴 아이콘

SNS 확산 구조를 표현한 **공유 네트워크(share-network)** 라인 아이콘을 사용했습니다.
기존 LFmall 메뉴 아이콘과 동일한 `stroke-width 1.3` 단색 라인 스타일로 제작하여 이질감이 없습니다.

---

## 4. 실행 방법

### 로컬

`index.html`을 브라우저로 열면 바로 동작합니다. (별도 서버 불필요)

로컬 서버로 띄우려면:

```bash
python -m http.server 8080
# http://localhost:8080
```

### GitHub Pages

1. 리포지토리에 본 폴더의 내용을 push
2. `Settings → Pages → Source: main / (root)` 선택
3. 발급된 URL의 `index.html` 접속

---

## 5. 시연 시나리오 (임원보고용)

1. **`index.html`** — 마이페이지 진입 → '나의 패션 클럽' 아래 **어필리에이트 서비스 활동 내역 (NEW)** 확인
2. 메뉴 클릭 → **총 수익 2,847,600원** 대시보드 (카운트업 연출) · 이번 달 / 월 평균 / 활동 기간
3. **수익 현황 보러가기** → 월별 수익 막대 그래프
4. 뒤로 → **내 링크 확인하기 (8)** → 지급 링크 목록 → **링크 복사** 버튼 탭 → 토스트 확인
5. 필터 **활성 / 종료** 전환 → 종료 링크는 취소선 + 복사 비활성
6. 뒤로 → **크리에이터 정보** (신청 정보 + 판매 수수료 **5%**) / **이용약관** (동의 이력)
7. **서비스 탈퇴하기** → 유의사항 → 사유 선택 → 동의 → 확인 모달 → 완료
8. **마이페이지로 이동** → 메뉴가 **미노출**된 것을 확인
9. 프레임 하단 **'시연 상태 초기화'** 버튼으로 원상 복구 후 재시연

---

## 6. 실서비스 연동 시 교체 지점

`js/data.js` 의 저장소를 API 호출로 교체하면 됩니다.

| 함수 | 대체 API (제안) |
|---|---|
| `AffiliateStore.get()` | `GET /api/mypage/affiliate/summary` |
| `AffiliateStore.get().creator` | `GET /api/mypage/affiliate/creator` |
| `AffiliateStore.get().revenue` | `GET /api/mypage/affiliate/revenue?months=6` |
| `AffiliateStore.get().creator.commissionRate` | `GET /api/mypage/affiliate/settlement` |
| `AffiliateStore.get().links` | `GET /api/mypage/affiliate/links` |
| `AffiliateStore.withdraw()` | `POST /api/mypage/affiliate/withdraw` |

메뉴 노출 제어는 마이페이지 메뉴 API 응답에 `affiliateJoined: boolean` 플래그를 추가하고,
`js/mypage.js` 의 `requireJoined` 조건과 연결하는 방식을 제안합니다.

---

## 7. 확인 필요 사항 (Open Issues)

- 약관·운영정책 문안은 가입 신청 페이지의 **POC 예시 문안**을 그대로 사용했습니다. 정식 오픈 전 법무 검토 필요
- 수익 금액은 **시연용 예시 데이터**이며 실제 정산 로직과 무관합니다
- 크리에이터 정보의 '연락처 · SNS 채널 수정' 화면은 본 POC 범위에서 제외 (안내 모달로 대체)
- **클릭수 · 구매전환수 · 전환율은 현 시점 데이터 제공이 불가하여 전 화면에서 제외**했습니다. 추후 집계 체계가 갖춰지면 `js/data.js` 의 `revenue` 배열에 필드를 추가해 복원할 수 있습니다
- 판매 수수료 5% · 정산 주기(익월 15일)는 시연용 값이며, 실제 계약 조건 확정 시 `js/data.js` 의 `creator.commissionRate` / `settleCycle` 수정
- 재가입 제한 기간(30일)은 가정값으로, 정책 확정 필요
- 링크 목록은 **URL · 등록일 · 활성/종료 상태**만 노출합니다. 연결 상품·기획전명은 요건 확정 후 추가 가능
- 링크 발급 ID(`L2607-014`) 체계는 예시값이며, ADMIN 발급 규칙 확정 필요
- 링크 복사는 `navigator.clipboard` 우선, 미지원 환경(`file://` 등)에서는 `execCommand` 폴백 사용
