# LFmall 어필리에이트 — 활동내역 (03_활동내역) v2.2

로그인 세션 기반으로 **어필리에이트 활동 내역**을 조회하는 실서비스용 화면입니다.
v1.x 의 시연용 iPhone 목업·더미 데이터 구조를 걷어내고, 공용 서버 API 계약
(`공용_서버_문서/SPEC.md`)에 연결된 반응형 웹으로 재구성했습니다.

- 대상 : 어필리에이트 가입 승인(`회원상태 = 활성`) 회원
- 진입점 : **`affiliate.html`** (`index.html` 은 리다이렉트 전용)
- 기술 스택 : Vanilla HTML / CSS / ES5 호환 JS — 빌드 도구·프레임워크 없음
- 인증 : 공용 모듈 `js/auth.js` (`window.LFAuth`) · 세션 토큰은 `sessionStorage`

---

## 1. v1.x → v2.0 변경 요약

| 구분 | v1.x | v2.0 |
|---|---|---|
| 레이아웃 | `.stage > .device > .screen` iPhone 12 Pro 목업 (상태바 9:41 / 홈 인디케이터 / 캡션 / 데모 툴바) | **목업 전면 제거.** `<div class="app">` 반응형 웹 (`max-width:640px`, 앱바 `sticky`, 하단 CTA `sticky`, `safe-area` 대응) |
| 진입 | `index.html`(마이페이지) → `affiliate.html` | `index.html` → **`affiliate.html` 즉시 리다이렉트** (meta refresh + `location.replace` 이중) |
| 최상위 앱바 | 뒤로가기(마이페이지) | **로그아웃 버튼** (확인 모달 → `LFAuth.logout()`) |
| 데이터 | `js/data.js` 의 더미 `SEED` + `localStorage` | **`userMe` API 호출 + `sessionStorage` stale-while-revalidate 캐시** (localStorage 사용 안 함) |
| 세션 | 없음 | 모든 페이지 진입 시 `LFAuth.requireAuth()` — 미인증이면 즉시 중단 후 로그인 이동 |
| 팔로워 수 | 배너·크리에이터 정보에 노출 (`shortCount()`) | **항목·마크업·CSS·헬퍼 전량 제거** |
| 링크 상태 | 활성 / 종료 | 활성 / **예정** / 종료 3종 |
| 상태 UI | 없음 | **로딩 스켈레톤 · 빈 상태 · 오류 + 다시 시도** 공통 헬퍼 |
| 마이페이지 | `mypage.html` 로직 · 스타일 | **삭제됨** (v2.0에서 마이페이지 진입 단계 제거) |

---

## 1-1. v2.0 → v2.1 변경 요약 (SNS 유형별 컬럼 대응)

서버가 `신청내역` 시트의 SNS 를 유형별 컬럼(21 대표채널 / 22 Instagram / 23 YouTube /
24 X(Twitter) / 25 TikTok / 26 기타)으로 분리하면서 `userMe` 의 `profile` 에
**필드가 추가**되었습니다. (제거·변경 없음 — SPEC §1-1 · §3-1)

| 필드 | 내용 |
|---|---|
| `primaryChannelType` | `"instagram"` 등 대표 채널 유형. 없으면 `null` |
| `snsByType` | `{instagram:[url…], youtube:[], x:[], tiktok:[], etc:[{channel,url}]}` |
| `channels[]` | 정렬 순서가 **대표채널 → Instagram → YouTube → X → TikTok → 기타** 로 변경 |

화면 반영 사항

- `js/data.js` 의 `normalize()` 화이트리스트에 **두 필드를 추가**해 그대로 보존합니다.
  - `snsByType` 은 문자열/객체 혼재를 `{url, channel}` 로 통일하고, 유효 항목이 없으면 `null`.
  - `primaryChannelType` 이 없으면 **대표 채널(`channels[0]`)의 유형으로 폴백**합니다.
- `AffiliateStore.channelGroups()` 가 표시용 그룹을 만듭니다.
  **`snsByType` 우선 · 없으면 `channels[]` 폴백** 이므로 구 스키마 데이터·캐시에서도 동일하게 그려집니다.
- `creator.html` 의 SNS 채널 섹션은 **유형별 그룹 카드**로 렌더합니다.
  (Instagram 2개 → 한 카드 안에 2줄, 그룹 헤더에 `2개` 표기)
- 대표 채널에는 `대표` 뱃지(`.badge-primary`)를 붙입니다.
  요약 배너(`affiliate.html`) · 기본 정보의 `대표 채널` 행 · 대표 유형 그룹 헤더 3곳,
  그룹 안에 여러 개가 있으면 대표 URL 줄에도 표기합니다.
- 채널 URL 은 `LF.safeUrl()`(= `http(s)://` 만 통과)을 지난 경우에만 앵커로 렌더하며,
  통과하지 못하면 텍스트로만 표시합니다.
- **팔로워 수는 계속 표시하지 않습니다.** (v2.0 요구사항 유지)

### 구 스키마 캐시 호환

배포 시점에 사용자의 `sessionStorage` 에는 **신규 필드가 없는 `userMe` 응답**이 남아 있습니다.
`getCached()` 는 이 payload 를 그대로 `normalize()` 에 넣으므로, 다음을 보장합니다.

| 캐시 상태 | 동작 |
|---|---|
| `snsByType` 없음 | `null` 로 정규화 → `channelGroups()` 가 `channels[]` 를 유형별로 묶어 폴백 |
| `primaryChannelType` 없음 | `primaryChannel`(없으면 `channels[0]`) 의 유형으로 폴백 |
| `channels` 자체가 없음 | 빈 그룹 → `등록된 SNS 채널이 없습니다` 빈 상태 |
| 갱신 응답에 신규 필드 도착 | 그 시점부터 `snsByType` 기준으로 재렌더 (기존 변경 감지 규칙 그대로) |

검증 : `node store-cache.js` 의 **20 · 21번 절** (실제 `js/data.js` 를 로드해 구 캐시를 주입)

> 신청 화면(`01_신청화면`)의 요청 페이로드 형식은 **바뀌지 않았습니다**(`snsChannels:[{channel,url}]`).
> 다만 **배열 순서가 대표채널을 결정**하므로, 신청 화면이 화면 입력 순서를 그대로 전송합니다.
> (검증 : `node sns-order.js`)

---

## 1-2. v2.1 → v2.2 변경 요약 (회원 기본키 = 이메일)

서버가 회원 PK 를 UUID → **정규화 이메일**로 교체했습니다(SPEC §1-7 / §4-0).
활동내역이 맞춘 것은 **3가지**입니다.

### ① `profile.id` 는 키, `profile.email` 이 표시값

| 필드 | 의미 | 화면에서 |
|---|---|---|
| `profile.id` | **정규화 이메일** (`hong.gil@example.com`) — 캐시 키·세션 대조용 | **화면에 찍지 않는다** |
| `profile.email` | 3열 원본표기 (`Hong.Gil@Example.com`) — 대소문자 보존 | **이것만 표시한다** |

`js/creator.js` 의 `displayEmail(p)` 한 곳에서만 표시값을 정합니다.
`profile.email` 이 비어 있는 응답이 오면 `profile.id` 가 **이메일 형식일 때만** 폴백하고,
구 스키마(UUID)면 아무것도 보여주지 않습니다. → 화면에 UUID 가 노출되는 경로가 없습니다.

### ② `memberIdChanged:true` → 캐시 폐기 후 재조회

`userUpdateContact` 로 이메일을 바꾸면 **회원ID 자체가 바뀝니다.**
응답(`{memberId, memberIdMasked, memberIdChanged, sessionRebound}`)을 보고 아래를 수행합니다.

| 응답 | 동작 |
|---|---|
| `memberIdChanged:true` | ① `LFAuth.updateSessionProfile({id:새 회원ID})` 로 세션 프로필 교체<br>② `LFAuth.clearAffiliateCache()` 로 캐시 폐기<br>③ `Store.load(true)` 로 즉시 재조회 |
| `memberIdChanged:false` | 표기(대소문자)만 바뀐 것 → **기존 동작 유지** (캐시만 무효화, 재조회 없음) |
| `sessionRebound:false` | 세션이 끊긴 것 → `clearSession()` 후 `SESSION_REBIND_REQUIRED` 로 거부 → 로그인 화면 |

> **세션 프로필의 `id` 를 반드시 함께 갱신해야 합니다.**
> 캐시 엔트리의 `memberId` 와 `LFAuth.getProfile().id` 가 어긋나면
> 세션 불일치 폐기 로직(§4 캐시 설계)에 걸려 **매 진입마다 캐시가 버려집니다.**
> 재조회에 실패해도 저장 자체는 성공했으므로 직전 화면 상태를 유지합니다(빈 화면 방지).

### ③ 연락처 수정 오류 코드 분기

`js/creator.js` 는 **문구가 아니라 `code`** 로 분기합니다.

| code | 안내 |
|---|---|
| `DUPLICATE` | 이미 사용 중인 이메일 또는 휴대폰번호 |
| `EMAIL_REQUIRED` | 이메일은 회원ID라 비울 수 없음 |
| `INVALID_EMAIL` | 이메일 형식 안내 |
| `CASCADE_FAILED` | ⚠️ 일부 정보가 갱신되지 않았을 수 있음 — **재시도 금지 + 담당자 문의** |
| `BUSY` | 잠시 후 다시 시도 |
| `SESSION_REBIND_REQUIRED` / `UNAUTHORIZED` | 안내 후 로그인 화면으로 이동 |

### 구 스키마 캐시 방어 (회원ID)

| 캐시 상태 | 동작 |
|---|---|
| `profile.id` 가 UUID (v2.1 이전 캐시) | 세션 프로필도 UUID면 그대로 렌더 (예외 없음) |
| 캐시는 UUID · 세션은 이메일 | `memberId` 불일치 → 즉시 폐기 후 `userMe` 재조회 |
| `profile.email` 없음 | `displayEmail()` 이 이메일 형식 `id` 로만 폴백, UUID 는 표시하지 않음 |

검증 : `node ../공용_서버_문서/_테스트하네스/admin-pii.js` 의 **[P-7] 절**
(실제 `js/auth.js` · `js/data.js` 를 수정 없이 로드해 4가지 경로를 재현)

---

## 2. 파일 구조

```
03_활동내역/
├── index.html            → affiliate.html 리다이렉트 전용
├── affiliate.html        활동 내역 메인 (진입점, 앱바 = 로그아웃)
├── links.html            내 링크 확인하기
├── revenue.html          수익 현황
├── creator.html          크리에이터 정보
├── terms.html            이용약관
├── withdraw.html         서비스 탈퇴하기
├── css/
│   ├── base.css          디자인 토큰 · 앱 셸 · 앱바 · 버튼 · 모달 · 토스트 · 상태 UI
│   ├── affiliate.css     화면 전용 스타일 (대시보드 · 링크 · 약관 · 탈퇴)
├── js/
│   ├── site-config.js    공용 경로 모듈 (window.LFSite) — 4개 화면 공통 사본, 수정 금지
│   ├── auth.js           공용 인증 모듈 (window.LFAuth) — 4개 화면 공통 사본, 수정 금지
│   ├── icons.js          인라인 SVG 아이콘 세트 (data-icon 속성으로 주입)
│   ├── common.js         공통 UI (앱바/본문/CTA 렌더 · DOM 빌더 · 상태 UI · 토스트 · 모달 · boot)
│   ├── data.js           AffiliateStore — userMe 기반 API 스토어
│   ├── affiliate.js      활동 내역 메인
│   ├── links.js          내 링크 확인하기
│   ├── revenue.js        수익 현황
│   ├── creator.js        크리에이터 정보 (+ 연락처 수정)
│   ├── terms.js          이용약관
│   ├── withdraw.js       서비스 탈퇴하기
└── README.md
```

### 스크립트 로드 순서 (전 페이지 동일)

```html
<script src="js/site-config.js"></script> <!-- 1. 경로 (window.LFSite) ★ 반드시 맨 앞 -->
<script src="js/auth.js"></script>     <!-- 2. 세션·API (window.LFAuth) -->
<script src="js/icons.js"></script>    <!-- 3. 아이콘 -->
<script src="js/common.js"></script>   <!-- 4. 공통 UI -->
<script src="js/data.js"></script>     <!-- 5. AffiliateStore -->
<script src="js/{page}.js"></script>   <!-- 6. 화면 로직 -->
```

**화면 이동 경로는 `js/site-config.js`(`window.LFSite`) 가 단독으로 소유합니다.**
`js/common.js` 는 `LFSite.resolve('login' | 'my')` 를 읽기만 하고, 경로를 주입하지 않습니다.
`auth.js` 의 `loginUrl / homeUrl / applyUrl` 기본값도 `LFSite` 에서 나옵니다.

| 로컬 폴더 | 배포 경로 |
|---|---|
| `01_신청화면/` | `/contents/aff/aff_join/` |
| `04_로그인/` | `/contents/aff/aff_login/` (`login.html` → `index.html`) |
| `02_ADMIN/` | `/contents/aff/adm/` |
| `03_활동내역/` | `/contents/aff/aff_my/` |

> 폴더명이 다르므로 `../04_로그인/login.html` 같은 경로를 새로 적으면 배포에서 404 가 됩니다.
> 설계는 `공용_서버_문서/SPEC.md` §5-0, 검증 절차는 `공용_서버_문서/QA_체크리스트.md` 참조.

---

## 3. 화면 이동 흐름

```
(미인증) ──────────────────────────────► LFSite.resolve('login')
                                          로컬 : ../04_로그인/login.html
                                          배포 : /contents/aff/aff_login/index.html
index.html ──리다이렉트──► affiliate.html  [앱바 = 로그아웃]
                             ├─ 수익 현황 보러가기 → revenue.html   ─┐
                             ├─ 내 링크 확인하기   → links.html      │ 뒤로가기 =
                             ├─ 크리에이터 정보    → creator.html    │ affiliate.html
                             ├─ 이용약관          → terms.html      │
                             └─ 서비스 탈퇴하기    → withdraw.html  ─┘
                                                     └─ 탈퇴 완료 → 세션 종료 → login.html
```

---

## 4. 데이터 계약 — `AffiliateStore` (`js/data.js`)

```js
AffiliateStore.load(force)   // Promise. 'userMe' 호출 후 캐시.
                             // 중복 호출 시 동일 Promise 반환 / 실패 시 캐시 해제(재시도 가능)
AffiliateStore.getCached()   // (동기) 저장된 캐시를 즉시 반환. 없으면 null → 스켈레톤 0초
AffiliateStore.refresh()     // 백그라운드 갱신. 실패해도 reject 하지 않는다(캐시 화면 유지)
AffiliateStore.onUpdate(fn)  // 갱신 결과가 '실제로 바뀌었을 때만' 호출. 반환값은 구독 해제 함수
AffiliateStore.onRefreshError(fn)  // 백그라운드 갱신 실패 통보 (UNAUTHORIZED 처리 등)
AffiliateStore.clearCache()  // 캐시 전체 폐기
AffiliateStore.reload()      // 강제 재조회
AffiliateStore.get()         // { profile, links, revenue, summary }  ※ load 완료 후에만 유효

AffiliateStore.totalRevenue() / currentMonth() / momDelta() / avgRevenue()
AffiliateStore.linkCount() / activeLinkCount() / bestMonth() / maxMonthAmount()
AffiliateStore.activeMonths() / primaryChannel() / commissionLabel() / hasCommission()
AffiliateStore.primaryChannelType()   // 'instagram' 등. 서버 미제공 시 대표 채널에서 유추, 없으면 ''
AffiliateStore.channelGroups()        // 유형별 채널 그룹 (대표채널 → IG → YT → X → TikTok → 기타)
AffiliateStore.channelCount()         // 그룹 내 항목 합계 (= 전체 채널 수)

AffiliateStore.updateContact({ email, phone })   // 'userUpdateContact' (성공 시 캐시 무효화)
                                                 // v2.2 : memberIdChanged:true 면 세션 프로필 id 교체
                                                 //        + clearAffiliateCache() + 즉시 재조회
AffiliateStore.withdraw(reason, etc)             // 'userWithdraw' (성공 시 캐시 폐기)
```

### 캐시 설계 — stale-while-revalidate

Apps Script 왕복은 **2~4초**이고 이는 구글 플랫폼 오버헤드라 서버 코드로 줄일 수 없습니다.
활동내역은 6개 HTML 문서로 분리돼 있어 페이지를 이동할 때마다 메모리 캐시가 사라지고,
그때마다 `userMe` 를 다시 호출해 스켈레톤이 2~4초씩 노출됐습니다.

→ `userMe` 응답 **원본**을 `sessionStorage`(키 `lf_affiliate_cache_v1`)에 보관합니다.

| 규칙 | 내용 |
|---|---|
| 저장 형식 | `{ savedAt:<epoch ms>, memberId:<profile.id>, payload:<userMe 응답 - 계측필드> }` |
| 저장 위치 | `sessionStorage` 전용. 쓸 수 없는 환경(프라이빗 모드)은 조용히 메모리 폴백 |
| 재진입 | `getCached()` 로 **즉시 렌더**(스켈레톤 0초) 후 **항상** `refresh()` — TTL 로 건너뛰지 않음 |
| 변경 감지 | 갱신 응답을 이전 payload 와 **JSON 직렬화 비교**. 동일하면 재렌더하지 않음(깜빡임 방지) |
| 계측 필드 | 서버가 붙이는 `_ms`/`_cached` 는 **저장·비교 전에 제거**(`LFAuth.stripResponseMeta`). 매번 값이 달라 '항상 변경됨' 오탐을 만들기 때문 |
| 세션 방어 | 캐시의 `memberId` ≠ `LFAuth.getProfile().id` 이면 즉시 폐기 (계정 전환) |
| 무효화 | `updateContact()` / `withdraw()` 성공, `LFAuth.clearSession()`·로그아웃, `UNAUTHORIZED` |
| **회원ID 변경 (v2.2)** | `memberIdChanged:true` → 세션 프로필 `id` 교체 → `clearAffiliateCache()` → `load(true)` 재조회 |
| 금지 | **`localStorage` 사용 금지.** 탭을 닫으면 개인정보도 함께 사라져야 합니다 |

키·저장 형식은 `LFAuth.CACHE_KEY` / `LFAuth.stripResponseMeta()` / `LFAuth.writeAffiliateCache()` /
`LFAuth.readAffiliateCache()` / `LFAuth.clearAffiliateCache()` 가 단독으로 소유하며,
`js/data.js` 와 `04_로그인/js/login.js`(로그인 직후 프리페치)가 이를 공유합니다.

#### 서버 캐시(30초)와의 관계 — 2단 캐시

`sessionStorage`(브라우저) 위·아래로 서버 `CacheService`(30초) 가 한 겹 더 있습니다.
ADMIN 이 값을 바꾸면 서버가 `me_<memberId>` 를 **즉시 폐기**하므로 정상 경로의 지연은
`0초 + 왕복 1회` 입니다. 읽기가 락을 잡지 않는 특성상 쓰기와 겹치면 옛 값이 다시 캐싱될 수
있으나, 그 값은 **서버 TTL 30초** 안에 사라집니다. **30초를 넘겨 낡은 값이 고정되는 경로는 없습니다.**
(단 한 화면에 계속 머무는 동안에는 갱신하지 않습니다 — 폴링 없음. v1과 동일)

#### 백그라운드 갱신 표시

앱바 바로 아래 2px `.refresh-bar` 하나뿐입니다.
트랙은 **항상 자리를 차지**하고 `is-on` 클래스로 색만 켜고 끕니다.
(`hidden` 으로 넣었다 뺐다 하면 갱신할 때마다 콘텐츠가 2px 씩 밀립니다)
갱신에 실패해도 캐시로 그린 화면을 **에러 화면으로 덮지 않습니다.**

검증 : `공용_서버_문서/_테스트하네스/store-cache.js` (`node store-cache.js`)
       — 스텁 응답 검증(1~11) + **실제 `apps-script.gs` 연동 2단 캐시 검증(12~19)**

각 화면은 `LF.boot(opt, render)` 로
`세션 가드 → 뼈대 → (캐시 있으면 즉시 render + 백그라운드 갱신 / 없으면 스켈레톤 → load → render)`
흐름을 태웁니다.
**localStorage 기반 상태 저장은 사용하지 않습니다. 서버가 유일한 진실의 원천입니다.**

### 화면 항목 매핑

| 화면 항목 | 데이터 출처 | 비고 |
|---|---|---|
| 활동명 | `profile.nickname` | 없으면 `활동명 미등록` |
| 대표 채널 | `profile.primaryChannel` (= `profile.channels[0]`) | 없으면 `등록된 채널 없음`. `대표` 뱃지 표기. 유형은 `profile.primaryChannelType` |
| SNS 채널 목록 | `profile.snsByType` (없으면 `profile.channels[]`) | `AffiliateStore.channelGroups()` 로 **유형별 그룹**. 같은 유형 다건은 한 그룹 안에 여러 줄 |
| **팔로워 수** | — | **항목 자체 제거** (마크업·CSS·`shortCount()` 전량 삭제) |
| 총 수익 | `summary.totalRevenue` | 원 단위, 3자리 콤마 |
| 활동 기간 | `summary.activeMonths` | `N개월` + 가입일 `profile.joinedAt` 부기 |
| 내 링크 | `links[]` | 활성/예정/종료 전부 노출 |
| 수수료 | `profile.commissionRate` | `5%` 형태. `null` 이면 `미설정` |
| 이메일·휴대폰 | `profile.email` / `profile.phone` | `userUpdateContact` 로 수정 가능. **표시는 `profile.email`(원본표기)** — `profile.id`(정규화 이메일)는 화면에 찍지 않는다 |

### 링크 표시 규칙

| status | 뱃지 | 카드 | 복사 버튼 |
|---|---|---|---|
| `active` | 검정 `활성` | 기본 | 활성 |
| `scheduled` | 파랑 `예정` + `{startAt}부터 사용할 수 있습니다.` | 기본 | 활성 |
| `closed` | 회색 `종료` | `opacity: .55` | `disabled` |

- 유효기간은 `startAt ~ endAt` 로 표기하며 `endAt` 이 비어 있으면 **`무기한`**
- 링크명(`name`)이 있으면 카드 제목으로 노출 (없으면 `링크 {id}`)
- 서버가 `status` 를 주지 않으면 SPEC §1-2 규칙과 동일하게 날짜로 계산

---

## 5. 상태 UI (`js/common.js`)

| 헬퍼 | 용도 |
|---|---|
| `LF.renderLoading(host, kind)` | 로딩 스켈레톤. `kind` = `dashboard` / `list` / `detail` / `text` |
| `LF.renderEmpty(host, opt)` | 빈 상태. `{icon, title, desc, actionText, actionHref, onAction}` |
| `LF.renderError(host, err, onRetry)` | 오류 + `다시 시도` / `로그인 화면으로`. `code === 'UNAUTHORIZED'` 면 세션 정리 후 로그인 이동 |
| `LF.boot(opt, render)` | 세션 가드 → 뼈대 렌더 → 캐시 우선 렌더/스켈레톤 분기까지 일괄 처리. 반환값은 재실행 함수(`rerun.stop()` 으로 자동 재렌더 중단) |
| `LF.boot` 옵션 `needsData:false` | 사용자 데이터를 기다리지 않고 즉시 `render()` (이용약관 등). 데이터 도착 시 `onUpdate` 로 재렌더 |
| `LF.setRefreshing(on)` | 앱바 하단 2px 인디터미네이트 진행 바. 백그라운드 갱신 중에만 노출되며 콘텐츠를 가리지 않음 |

빈 상태 문구는 화면별로 다릅니다.
링크 0건 → `지급받은 링크가 없습니다` / 필터 결과 0건 → `해당 상태의 링크가 없습니다` /
수익 0건 → `집계된 수익이 없습니다`.

---

## 6. 보안 · 접근성 · 모바일

- **XSS 방지** — 서버에서 내려온 값(활동명·링크명·링크 URL·채널 핸들 등)은 `innerHTML` 로 넣지 않고
  `LF.el()` 의 `text`(→ `textContent`) / `attrs`(→ `setAttribute`) 로만 주입합니다.
  `innerHTML` 은 코드에 하드코딩된 정적 마크업에만 사용합니다.
- **링크 검증** — `LF.safeUrl()` 이 `http(s)://` 로 시작하는 URL 만 통과시키며,
  통과한 경우에만 `<a target="_blank" rel="noopener noreferrer">` 로 렌더합니다.
  그 외에는 앵커 없이 텍스트로만 표시하고 복사 버튼도 비활성화합니다.
- **터치 타겟** 최소 44×44px, **입력 폰트 16px** (iOS 자동 확대 방지), `env(safe-area-inset-*)` 대응
- 앱바 `position: sticky` + 하단 1px 라인, 하단 CTA `position: sticky; bottom: 0`
- `aria-live` 오류·토스트 안내, `role="radiogroup"` / `role="tablist"`, 포커스 링 유지,
  상태는 색상뿐 아니라 **텍스트 뱃지**로 병기
- `prefers-reduced-motion` 존중 (카운트업·막대 애니메이션·스켈레톤 펄스 비활성)

---

## 7. 실행 방법

`js/auth.js` 는 WebCrypto 를 사용하므로 **보안 컨텍스트(HTTPS 또는 localhost)** 가 필요합니다.
`file://` 로 직접 열면 로그인이 동작하지 않습니다.

```bash
# v2 루트에서 실행 (04_로그인 과 상대경로가 맞아야 함)
cd v2
python -m http.server 8080
# http://localhost:8080/04_로그인/login.html  → 로그인 → 03_활동내역/affiliate.html
```

배포 전 `공용_서버_문서/SPEC.md` §7 체크리스트에 따라
`js/auth.js` 의 `CONFIG.APPS_SCRIPT_URL` 이 최신 웹앱 URL 인지 확인하세요.
(`auth.js` 는 4개 화면 공통 사본이므로 **이 폴더에서 단독 수정하지 않습니다.**)

---

## 8. 확인 필요 사항 (Open Issues)

- 약관·운영정책 문안은 신청 페이지의 **POC 예시 문안**입니다. 정식 오픈 전 법무 검토 필요
- 약관 동의 일시는 서버가 별도 필드를 내려주지 않아 **`profile.joinedAt`(신청일)** 로 표기합니다
- 크리에이터 정보에서 수정 가능한 항목은 **이메일 · 휴대폰번호** 뿐입니다
  (`userUpdateContact`). SNS 채널 수정 API 는 미제공 — 담당자 문의 안내로 처리
  (대표 채널 변경도 회원 화면에서는 불가. 신청 시점의 입력 순서로 결정됩니다)
- `snsByType` 의 `etc` 항목은 서버가 채널명(`블로그` 등)을 함께 내려주므로 그대로 표기하지만,
  9열 원본만 있는 구 데이터는 채널명이 비어 URL 에서 표시 이름을 만듭니다
- 정산 주기·정산 기준 문구는 화면 상수입니다. 계약 조건 확정 시 `js/creator.js` 수정
- 재가입 제한 기간(30일)은 가정값으로 정책 확정 필요
- 클릭수·구매전환수·전환율은 데이터 미제공으로 전 화면에서 제외했습니다
- 링크 복사는 `navigator.clipboard` 우선, 미지원 환경에서는 `execCommand('copy')` 폴백
