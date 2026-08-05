/* =========================================================
 * LFmall 인플루언서 신청 관리 ADMIN - admin.js  v2.1
 * =========================================================
 * [설정] APPS_SCRIPT_URL : 신청 화면(app.js)과 동일한 웹앱 URL을 사용합니다.
 * 인증 토큰은 브라우저 메모리(sessionStorage)에만 보관되며 탭을 닫으면 사라집니다.
 * 서버 세션은 2시간 후 자동 만료됩니다.
 *
 * [v2.0 추가 기능]
 *   1) 수수료 관리   : 목록 수수료율 컬럼 + 다중 선택 일괄 입력(setCommission)
 *   2) 링크 관리     : 좌측 네비 신규 뷰 (linkList/Create/Update/Delete/BulkCreate)
 *   3) 수익 관리     : 좌측 네비 신규 뷰 (revenueList/revenueUpsert)
 *   4) 비밀번호 변경 : 상세 모달에서 회원 로그인 비밀번호 지정(adminSetPassword)
 *   5) LFmall ID     : Legacy 강등 (readonly / 신규 등록 시 미수집)
 *
 * [v2.1 추가 기능]
 *   6) SNS 유형별    : list 응답의 snsByType / primaryChannelType 우선 사용
 *                      (없으면 기존 snsText 파싱으로 폴백 — v2.1 이전 데이터 대응)
 *   7) 순번 PK 노출  : 링크번호 / 수익번호 / 초대번호 컬럼 (UUID → 순번 문자열)
 *   8) 엑셀          : 양식 다운로드 · 대량 업로드(링크/수익) · 조회 결과 다운로드(4개 화면)
 *                      ※ SheetJS(CDN) 미로드 시 엑셀 버튼만 비활성화되고 나머지는 정상 동작
 *   9) 링크 추가 모달 : 인플루언서 셀렉트 → 텍스트 검색 자동완성 + 전체 목록 펼치기
 *
 * [의존] auth.js (window.LFAuth) — 비밀번호 자격증명 생성 전용으로만 사용합니다.
 *        관리자 세션은 기존 api() + sessionStorage['lf_admin_token'] 방식을 유지합니다.
 * ========================================================= */
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwVjfkUZPKJfF7Ma6AriDgkbMISNTH7qaCh_Os5TgLkF5hx7rYFNocDLmZl3LyEr1J6Ug/exec"
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* 어떤 형식이 와도 "2026년 07월 28일 14시 30분 05초"로 통일 (초대일시 표기)
   - "2026-07-28 14:30:05" (문자열 저장분)
   - "Tue Jul 28 2026 14:30:05 GMT+0900 (한국 표준시)" (시트가 날짜값으로 자동변환한 분) */
function formatKST(raw) {
  if (!raw && raw !== 0) return "-";
  const s = String(raw).trim();
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) return `${m[1]}년 ${m[2]}월 ${m[3]}일 ${m[4]}시 ${m[5]}분 ${m[6]}초`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).formatToParts(d).reduce((o, p) => (o[p.type] = p.value, o), {});
    const hh = parts.hour === "24" ? "00" : parts.hour;
    return `${parts.year}년 ${parts.month}월 ${parts.day}일 ${hh}시 ${parts.minute}분 ${parts.second}초`;
  }
  return s;
}

/* =========================================================
 * 서버 배포 상태 자가 진단
 * ---------------------------------------------------------
 * Apps Script 는 코드를 고쳐도 '새 버전 재배포' 를 하지 않으면 구버전이 계속 응답합니다.
 * 이때 가입은 성공한 것처럼 보이지만 비밀번호가 저장되지 않아
 * 목록의 '비밀번호' 컬럼이 전부 '미설정' 이 되고 회원 로그인이 불가능해집니다.
 * → 로그인 직후 serverInfo 를 호출해 헤더 뱃지로 즉시 드러냅니다.
 * ========================================================= */
let serverState = null; // { ok, version, apiLevel, outdated, message }

function renderServerBadge() {
  const badge = $("#serverBadge");
  if (!badge) return;
  if (!serverState) { badge.hidden = true; return; }
  badge.hidden = false;
  if (serverState.outdated) {
    badge.className = "server-badge is-outdated";
    badge.textContent = "⚠ 서버 구버전 — 재배포 필요";
    badge.title = "클릭하면 조치 방법을 안내합니다.";
  } else if (serverState.ok) {
    badge.className = "server-badge";
    badge.textContent = "서버 v" + (serverState.version || "?");
    badge.title = "API 레벨 " + serverState.apiLevel;
  } else {
    /* 네트워크 오류 등 판정 불가 */
    badge.className = "server-badge";
    badge.textContent = "서버 상태 확인 불가";
    badge.title = serverState.message || "";
  }
}

async function checkServerVersion() {
  if (typeof window.LFAuth === "undefined" || !LFAuth.checkServer) return;
  LFAuth.config({ apiUrl: CONFIG.APPS_SCRIPT_URL });
  try {
    serverState = await LFAuth.checkServer();
  } catch (e) {
    serverState = { ok: false, outdated: false, version: "", apiLevel: 0, message: String(e && e.message || e) };
  }
  renderServerBadge();
  if (serverState && serverState.outdated) {
    showToast("서버가 구버전으로 배포되어 있습니다. 재배포가 필요합니다.");
  }
}

$("#serverBadge").addEventListener("click", () => {
  if (!serverState || !serverState.outdated) return;
  $("#serverModalMsg").textContent = serverState.message;
  openModal("#serverModal");
});

let records = [];        // 신청 내역
let invites = [];        // 초대 내역 (전체)
let invitesView = [];    // 초대 내역 (검색 필터 적용)
let masked = true;       // 개인정보 마스킹 상태 (기본: 마스킹)
let pendingDelete = null; // { type: 'app' | 'inv' | 'link', id }

/* --- v2.0 상태 --- */
/* 링크·수익 뷰는 '검색 결과'가 아닌 '전체 인플루언서'를 대상으로 하므로
   신청 내역 뷰(records, 검색 필터 적용)와 분리해 보관합니다. */
let allMembers = [];
const selectedIds = new Set(); // 신청 내역 다중 선택 (페이지 이동해도 id 기준 유지)
let links = [];          // 링크 관리 뷰 (조회 결과 전체)
let revRows = [];        // 수익 관리 뷰 행 [{id(회원id), name, nickname, rate, total, saved, amount}]
let currentDetail = null; // 상세 모달에 열려 있는 신청 레코드
const loadedView = { links: false, revenue: false }; // 뷰별 최초 진입 시 1회 로드
let currentView = "applications";  // 현재 열려 있는 뷰 (회원ID 변경 후 재조회 판단용)

/* 페이징 상태 (10/50/100) */
const paging = {
  app: { page: 1, size: 10 },
  inv: { page: 1, size: 10 },
  link: { page: 1, size: 10 }
};
function pageSlice(arr, p) {
  const totalPages = Math.max(1, Math.ceil(arr.length / p.size));
  if (p.page > totalPages) p.page = totalPages;
  if (p.page < 1) p.page = 1;
  const start = (p.page - 1) * p.size;
  return { rows: arr.slice(start, start + p.size), start, totalPages };
}

/* 인스타 초대 DM 설정 */
/* 발송 계정·메시지 기본값 (폼에서 매 발송마다 수정 가능) */
const DEFAULT_SENDER = "lfmall_fashionclub";
const DEFAULT_MESSAGE = "안녕하세요 LFmall 입니다. 인플루언서 가입 신청 URL 전달드려요. (https://buycrown.cloud/lfapplyfor/) 신청 이후에는 담당자가 별도 연락드릴 예정입니다.";

/* 현재 폼에 입력된 발송 계정 / 메시지 (비어있으면 기본값) */
function currentSender() { return ($("#inviteSender").value || "").trim().replace(/^@/, "") || DEFAULT_SENDER; }
function currentMessage() { return ($("#inviteMessage").value || "").trim() || DEFAULT_MESSAGE; }

/* ---------- 공통 ---------- */
function showToast(msg) {
  const toast = $("#toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 3000);
}

function setLoading(on, msg) {
  $("#loadingMsg").textContent = msg || "처리 중…";
  $("#loadingOverlay").classList.toggle("show", on);
}

async function api(action, payload = {}) {
  const body = { action, token: sessionStorage.getItem("lf_admin_token") || "", ...payload };
  const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body)
  });
  const result = await res.json().catch(() => null);
  if (!res.ok || !result) throw new Error("서버 응답을 확인할 수 없습니다.");
  if (result.status !== "ok") {
    /* 세션 만료 시 로그인 화면으로 복귀
       서버는 code:'UNAUTHORIZED' 를 내려주므로 코드로 우선 판정하고,
       구버전 서버 호환을 위해 메시지 문자열도 함께 확인한다. */
    if (result.code === "UNAUTHORIZED" || String(result.message || "").indexOf("세션") !== -1) {
      sessionStorage.removeItem("lf_admin_token");
      showLogin();
    }
    const err = new Error(errorMessageFor(result));
    /* 구버전 서버는 v2 액션을 'UNKNOWN_ACTION' 으로 거절한다.
       auth.js(_request)와 동일하게 'OUTDATED_SERVER' 로 정규화해
       상위 호출부가 화면·문구를 한 가지 규칙으로 분기하게 한다. */
    err.code = result.code === "UNKNOWN_ACTION" ? "OUTDATED_SERVER" : result.code;
    throw err;
  }
  return result;
}

/* 서버 오류 코드별 운영자 안내 문구.
   서버 원문 메시지를 그대로 노출하면 "왜 실패했고 무엇을 해야 하는지"가 전달되지 않는
   코드(BUSY / SCHEMA_MISMATCH / LOCKED / UNKNOWN_ACTION)만 문구를 보강한다. */
function errorMessageFor(result) {
  const raw = (result && result.message) || "요청에 실패했습니다.";
  switch (result && result.code) {
    case "BUSY":
      return "다른 요청이 처리 중입니다. 잠시 후 다시 시도해 주세요.";
    case "SCHEMA_MISMATCH":
      return raw + "\n(신청내역 시트의 1~14열 순서를 원래대로 복구한 뒤 다시 시도하세요.)";
    case "LOCKED":
      return raw + " (10분 후 자동 해제됩니다.)";
    case "EMAIL_REQUIRED":
      return raw + "\n(이메일은 회원ID(기본키)이므로 비워 둘 수 없습니다.)";
    case "INVALID_EMAIL":
      return raw + "\n(예: name@example.com — 공백·연속 점(..) 은 사용할 수 없습니다.)";
    case "CASCADE_FAILED":
      return raw + "\n재시도하지 마시고 담당자에게 문의해 주세요.";
    case "UNKNOWN_ACTION":
      return (typeof window.LFAuth !== "undefined" && LFAuth.OUTDATED_MSG) || raw;
    default:
      return raw;
  }
}

/* @pure:mask-start */
/* ---------- 마스킹 (개인정보 표시 최소화) ---------- */
function maskName(v) {
  if (!v) return "-";
  if (v.length <= 1) return v;
  if (v.length === 2) return v[0] + "*";
  return v[0] + "*".repeat(v.length - 2) + v[v.length - 1];
}
/* [v2.2 통일] 서버 maskId() 와 **완전히 같은 규칙**을 쓴다 (SPEC §1-7).
   · 별표 개수를 아이디 길이에 비례시키면 (1) 서버가 내려준 memberIdMasked 와
     클라이언트 폴백이 서로 다른 문자열이 되어 같은 회원이 화면에서 두 모습으로 보이고
     (예: 회원ID 변경 확인 모달의 "현재 → 변경 후"),
     (2) '로컬파트 길이' 라는 정보가 마스킹본에서 그대로 새어나간다.
     두 이유 모두 별표를 고정 3개로 둘 근거다. */
function maskEmail(v) {
  const s = String(v == null ? "" : v);
  if (!s) return "-";
  if (s.indexOf("@") === -1) return s;
  const p = s.split("@");
  return p[0].slice(0, 2) + "***@" + p[1];
}
function maskPhone(v) {
  if (!v) return "-";
  return v.replace(/^(\d{3})-(\d{3,4})-(\d{4})$/, "$1-****-$3");
}
/* [v2.2] 회원ID = 이메일(개인정보).
   서버가 `memberIdMasked`(ab***@example.com) 를 함께 내려주므로 마스킹 상태에서는 그 값을 쓴다.
   서버가 값을 주지 않는 경우(구버전 배포 · 로컬에서 새로 만든 행)를 대비해 폴백도 둔다.
   ⚠️ 이 함수의 결과는 '표시 전용' 이다. 서버로 보내는 payload 에는 언제나 원본 id 를 넣는다. */
function maskMemberId(rawId, maskedFromServer) {
  const raw = String(rawId == null ? "" : rawId).trim();
  if (!raw) return "-";
  const fromServer = String(maskedFromServer == null ? "" : maskedFromServer).trim();
  if (fromServer) return fromServer;
  /* 이메일이면 이메일 규칙, 이메일이 없어 식별자를 유지 중인 회원은 앞 8자만 노출 */
  return raw.indexOf("@") > 0 ? maskEmail(raw) : (raw.length > 8 ? raw.slice(0, 8) + "\u2026" : raw);
}
const disp = {
  name: (v) => (masked ? maskName(v) : v || "-"),
  email: (v) => (masked ? maskEmail(v) : v || "-"),
  phone: (v) => (masked ? maskPhone(v) : v || "-"),
  /* 회원ID : 마스킹 ON → memberIdMasked / OFF → 원본 */
  memberId: (rawId, maskedFromServer) => {
    const raw = String(rawId == null ? "" : rawId).trim();
    if (!masked) return raw || "-";
    return maskMemberId(raw, maskedFromServer);
  }
};
/* 이메일 정규화 — 서버(normalizeEmail)와 동일 규칙. 회원ID 비교에만 쓴다. */
function normEmailKey(v) { return String(v == null ? "" : v).trim().toLowerCase(); }
/* @pure:mask-end */

/* ---------- v2.0 공통 포맷 유틸 ---------- */
/* 수수료율: null/미설정 → "-", 값 있으면 "5%" */
function fmtRate(v) {
  return (v === null || v === undefined || v === "") ? "-" : Number(v) + "%";
}
/* 금액: 3자리 콤마 (원 단위 정수) */
function fmtMoney(v) {
  const n = Number(v || 0);
  return isNaN(n) ? "0" : Math.round(n).toLocaleString("ko-KR");
}
/* 입력값에서 숫자만 추출 (콤마·공백 제거) */
function parseMoney(v) {
  const d = String(v == null ? "" : v).replace(/[^0-9]/g, "");
  return d ? Number(d) : 0;
}
/* 로컬 기준 YYYY-MM-DD */
function todayYmd() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
/* 로컬 기준 YYYY-MM */
function currentYm() { return todayYmd().slice(0, 7); }
/* 유효기간 표기: 시작 ~ 종료 (종료 없으면 무기한) */
function fmtPeriod(startAt, endAt) {
  const s = startAt || "-";
  return endAt ? (s + " ~ " + endAt) : (s + " ~ 무기한");
}
/* 회원 id → 신청 레코드 (링크/수익 뷰에서 마스킹 규칙을 일관 적용하기 위함) */
function memberOf(id) {
  return allMembers.find((r) => r.id === id) || records.find((r) => r.id === id) || null;
}
/* 회원 표시명 (활동명 · 마스킹된 이름)
   [v2.2] 목록에 없는 회원은 서버가 준 memberName / memberIdMasked 로 표기한다.
          memberName 은 원본 이름이므로 반드시 disp.name 을 통과시킨다. */
function memberLabel(id, fallbackName, maskedId) {
  const m = memberOf(id);
  if (m) return (m.nickname || "(활동명 없음)") + " · " + disp.name(m.name);
  const nm = String(fallbackName == null ? "" : fallbackName).trim();
  /* 서버는 회원을 못 찾으면 memberName 에 "(삭제된 회원)" 을 넣는다 — 이름이 아니므로 마스킹 대상이 아니다 */
  const head = (nm && nm.charAt(0) !== "(") ? disp.name(nm) : (nm || "(삭제된 회원)");
  return head + " · " + disp.memberId(id, maskedId);
}
/* @pure:sns-start */
/* http(s) URL 검증 */
function isHttpUrl(v) { return /^https?:\/\//i.test(String(v || "").trim()); }

/* ---------- SNS 채널 아이콘 ---------- */
const SNS_ICONS = {
  instagram: '<svg viewBox="0 0 24 24"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16m0 3.68a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32m0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8m6.4-11.85a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0"/></svg>',
  youtube: '<svg viewBox="0 0 24 24"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.9 2.9 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.9 2.9 0 0 1 .88.13V9.4a6.33 6.33 0 0 0-.88-.05A6.34 6.34 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>'
};

/* 채널명이 비어 있을 수 있으므로(=URL만 입력된 줄) URL 도 함께 판정에 사용한다.
   'x' 는 한 글자라 단순 includes 로는 오탐이 크므로 단어/도메인 단위로만 인정한다. */
function snsKeyOf(channel, url) {
  const c = ((channel || "") + " " + (url || "")).toLowerCase();
  if (c.includes("insta")) return "instagram";
  if (c.includes("youtube") || c.includes("youtu.be") || c.includes("유튜브")) return "youtube";
  if (c.includes("tiktok") || c.includes("틱톡")) return "tiktok";
  if (c.includes("twitter") || c.includes("x.com") || /(^|[\s(/])x([\s)/]|$)/.test(c)) return "x";
  return "link";
}

/* snsText("Instagram: https://..." 줄 단위) → [{channel, url}]
   채널명 없이 URL만 적힌 줄('https://x.com/abc')도 스킴 콜론을 구분자로 오인하지 않고
   URL 전체를 그대로 인식한다. (서버 parseChannels 와 동일 규칙) */
function parseSns(snsText) {
  return (snsText || "").split(/\r?\n/).map((rawLine) => {
    const line = String(rawLine || "").trim();
    if (!line) return null;
    let channel = "";
    let url = line;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(line)) {
      const idx = line.indexOf(":");
      if (idx === -1) return null;
      channel = line.slice(0, idx).trim();
      url = line.slice(idx + 1).trim();
    }
    if (!url || !/^https?:\/\//i.test(url)) return null;
    return { channel, url };
  }).filter(Boolean);
}

/* =========================================================
 * v2.1 : SNS 채널 유형별 처리
 * ---------------------------------------------------------
 * 서버가 신청내역 21~26열(대표채널 / Instagram / YouTube / X / TikTok / 기타)을
 * `snsByType` + `primaryChannelType` 으로 내려줍니다. 화면은 이 값을 **우선** 사용하고,
 * 비어 있으면(=v2.1 이전 데이터) 기존 `snsText` 를 parseSns() 로 파싱해 폴백합니다.
 * ========================================================= */
const SNS_TYPE_LABEL = {
  instagram: "Instagram", youtube: "YouTube", x: "X(Twitter)",
  tiktok: "TikTok", blog: "블로그", etc: "기타 채널", link: "기타 채널"
};
/* 서버가 주는 유형 문자열을 그대로 객체 키로 쓰지 않는다(프로토타입 오염 방지) */
function hasKey(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
function snsTypeLabel(type) {
  const t = String(type || "");
  return hasKey(SNS_TYPE_LABEL, t) ? SNS_TYPE_LABEL[t] : (t || "기타 채널");
}
/* 아이콘 스프라이트 키 (4대 채널 외에는 공용 링크 아이콘) */
function iconKeyOf(type) {
  const t = String(type || "");
  return hasKey(SNS_ICONS, t) ? t : "link";
}

/* snsByType({instagram:[url…], …, etc:[{channel,url}]}) → [{channel,url,type}] 평탄화 */
function channelsFromByType(byType) {
  if (!byType || typeof byType !== "object") return [];
  const out = [];
  ["instagram", "youtube", "x", "tiktok"].forEach((t) => {
    const arr = Array.isArray(byType[t]) ? byType[t] : [];
    arr.forEach((u) => {
      const url = String(u == null ? "" : u).trim();
      if (url) out.push({ channel: SNS_TYPE_LABEL[t], url, type: t });
    });
  });
  const etc = Array.isArray(byType.etc) ? byType.etc : [];
  etc.forEach((e) => {
    const url = String((e && e.url != null) ? e.url : (e == null ? "" : e)).trim();
    if (!url) return;
    const channel = String((e && e.channel) || "").trim();
    out.push({ channel: channel || SNS_TYPE_LABEL.etc, url, type: "etc" });
  });
  return out;
}

/* 레코드의 채널 목록 — snsByType 우선, 비어 있으면 parseSns(snsText) 폴백 */
function channelsOf(record) {
  if (!record) return [];
  const byType = channelsFromByType(record.snsByType);
  if (byType.length) return byType;
  return parseSns(record.snsText).map((c) => ({
    channel: c.channel, url: c.url, type: snsKeyOf(c.channel, c.url)
  }));
}

/* 대표채널 유형 — 서버 21열(primaryChannelType) 우선, 없으면 첫 채널의 유형 */
function primaryTypeOf(record) {
  const t = String((record && record.primaryChannelType) || "").trim().toLowerCase();
  if (t) return t;
  const list = channelsOf(record);
  return list.length ? list[0].type : "";
}

/* 유형별로 묶은 URL 문자열 (엑셀 다운로드 · 상세 모달 공용) */
function snsGroupsOf(record) {
  const g = { instagram: [], youtube: [], x: [], tiktok: [], etc: [] };
  channelsOf(record).forEach((c) => {
    if (c.type !== "etc" && hasKey(g, c.type)) g[c.type].push(c.url);
    else g.etc.push((c.channel ? c.channel + ": " : "") + c.url);
  });
  return {
    instagram: g.instagram.join("\n"), youtube: g.youtube.join("\n"),
    x: g.x.join("\n"), tiktok: g.tiktok.join("\n"), etc: g.etc.join("\n")
  };
}
/* @pure:sns-end */

/* 목록 SNS 아이콘 — 인자는 '레코드'다 (v2.0 까지는 snsText 문자열이었다) */
function buildSnsIcons(record) {
  const wrap = document.createElement("span");
  wrap.className = "sns-icons";
  const channels = channelsOf(record);
  if (!channels.length) { wrap.textContent = "-"; return wrap; }
  channels.forEach(({ channel, url, type }) => {
    const key = iconKeyOf(type);
    const label = channel || snsTypeLabel(type);
    /* [보안] 21~26열은 시트에서 직접 편집될 수 있으므로 http(s) 인 값만 앵커로 만든다 */
    const safe = isHttpUrl(url);
    const el = document.createElement(safe ? "a" : "span");
    el.className = "sns-ico " + key;
    if (safe) {
      el.href = String(url).trim();
      el.target = "_blank";
      el.rel = "noopener noreferrer";
      el.setAttribute("aria-label", label + " 채널 열기");
    } else {
      el.setAttribute("aria-label", label + " (열 수 없는 주소)");
    }
    el.title = label + " · " + url;        /* 마우스 오버 시 URL 표시 */
    el.innerHTML = SNS_ICONS[key];         /* 내부 상수 SVG 만 삽입 (서버 데이터 아님) */
    el.addEventListener("click", (e) => e.stopPropagation()); /* 행 클릭(상세)과 분리 */
    wrap.appendChild(el);
  });
  return wrap;
}

/* 목록 '대표채널' 셀 */
function buildPrimaryChannel(record) {
  const type = primaryTypeOf(record);
  if (!type) {
    const dash = document.createElement("span");
    dash.textContent = "-";
    return dash;
  }
  const wrap = document.createElement("span");
  wrap.className = "primary-tag";
  const ico = document.createElement("span");
  const key = iconKeyOf(type);
  ico.className = "sns-ico " + key;
  ico.innerHTML = SNS_ICONS[key];          /* 내부 상수 SVG */
  wrap.appendChild(ico);
  const txt = document.createElement("span");
  txt.textContent = snsTypeLabel(type);
  wrap.appendChild(txt);
  wrap.title = "대표채널: " + snsTypeLabel(type);
  return wrap;
}

/* 상세 모달의 유형별 SNS 표시 (원본 textarea 는 그대로 편집용으로 유지) */
function renderSnsByType(record) {
  const box = $("#f-snsByType");
  if (!box) return;
  box.textContent = "";
  const note = (text) => {
    const d = document.createElement("div");
    d.className = "none";
    d.textContent = text;
    box.appendChild(d);
  };
  if (!record || !record.id) {
    note("신규 등록 시에는 아래 원본 입력란에 '채널명: URL' 형식으로 한 줄씩 입력하세요.");
    return;
  }
  const list = channelsOf(record);
  if (!list.length) { note("등록된 SNS 채널이 없습니다."); return; }

  const primary = primaryTypeOf(record);
  const order = ["instagram", "youtube", "x", "tiktok", "etc"];
  const groups = {};
  list.forEach((c) => {
    const t = order.indexOf(c.type) === -1 ? "etc" : c.type;
    if (!hasKey(groups, t)) groups[t] = [];
    groups[t].push(c);
  });
  order.forEach((t) => {
    if (!hasKey(groups, t) || !groups[t].length) return;
    const row = document.createElement("div");
    row.className = "row";
    const k = document.createElement("div");
    k.className = "k";
    k.textContent = snsTypeLabel(t) + (t === primary ? " (대표)" : "");
    const v = document.createElement("div");
    v.className = "v";
    groups[t].forEach((c) => {
      const safe = isHttpUrl(c.url);
      const el = document.createElement(safe ? "a" : "span");
      if (safe) { el.href = String(c.url).trim(); el.target = "_blank"; el.rel = "noopener noreferrer"; }
      el.textContent = (t === "etc" && c.channel ? c.channel + ": " : "") + c.url;
      el.title = c.url;
      v.appendChild(el);
    });
    row.appendChild(k);
    row.appendChild(v);
    box.appendChild(row);
  });
}

/* ---------- 첨부파일 다운로드 (Google Drive 직접 다운로드 링크) ---------- */
function fileDownloadUrl(f) {
  return f.fileId ? "https://drive.google.com/uc?export=download&id=" + f.fileId : f.url;
}

function downloadFiles(files) {
  (files || []).forEach((f, i) => {
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = fileDownloadUrl(f);
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, i * 400); /* 다중 파일 연속 다운로드 간격 */
  });
}

/* ---------- 화면 전환 ---------- */
function showLogin() {
  $("#loginArea").style.display = "";
  $("#adminArea").style.display = "none";
  $("#headerActions").style.display = "none";
}
function showAdmin() {
  $("#loginArea").style.display = "none";
  $("#adminArea").style.display = "";
  $("#headerActions").style.display = "flex";
}

/* ---------- 로그인 / 로그아웃 ---------- */
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("#loginId").value.trim();
  const pw = $("#loginPw").value;
  if (!id || !pw) { showToast("아이디와 패스워드를 입력해 주세요."); return; }
  setLoading(true, "로그인 중…");
  try {
    const result = await api("login", { id, pw });
    sessionStorage.setItem("lf_admin_token", result.token);
    $("#loginPw").value = "";
    showAdmin();
    /* 서버 배포 버전 확인 (비동기 · 실패해도 목록 조회를 막지 않음) */
    checkServerVersion();
    await loadList();
    await loadInvites();
  } catch (err) {
    /* 구버전 서버(v1)에는 v2 액션이 없어 api() 가 'OUTDATED_SERVER' 로 정규화해 던진다.
       원인이 코드가 아니라 '재배포 누락' 임을 헤더 뱃지로도 즉시 드러낸다. */
    if (err && err.code === "OUTDATED_SERVER") {
      serverState = {
        ok: false, outdated: true, version: "", apiLevel: 0,
        message: (typeof window.LFAuth !== "undefined" && LFAuth.OUTDATED_MSG) || err.message
      };
      renderServerBadge();
    }
    showToast(err.message);
  } finally {
    setLoading(false);
  }
});

$("#btnLogout").addEventListener("click", async () => {
  try { await api("logout"); } catch (e) { /* 무시 */ }
  sessionStorage.removeItem("lf_admin_token");
  masked = true;
  updateMaskButton();
  /* 화면에 남은 개인정보·선택 상태를 모두 비운다 */
  records = []; allMembers = []; links = []; revRows = [];
  selectedIds.clear();
  currentDetail = null;
  loadedView.links = false;
  loadedView.revenue = false;
  pwNoneFilter = false;
  renderPwNoneChip();
  serverState = null;
  renderServerBadge();
  /* 엑셀 업로드/다운로드 대기 상태도 함께 비운다 (개인정보가 화면에 남지 않도록) */
  pendingDownload = null;
  xlState.mode = null; xlState.rows = []; xlState.fileName = "";
  xlState.running = false; xlState.aborted = false;
  xlDupCheckbox = null; xlErrCheckbox = null;
  closeModal("#excelModal");
  closeModal("#exportWarnModal");
  /* v2.2 : 회원ID 변경 확인 / 연쇄 갱신 경고도 함께 정리 */
  pendingSave = null;
  closeModal("#memberIdModal");
  closeModal("#cascadeModal");
  switchView("applications");
  showLogin();
  showToast("로그아웃되었습니다.");
});

/* ---------- 마스킹 토글 ---------- */
function updateMaskButton() {
  $("#btnMask").textContent = masked ? "🔒 마스킹 해제" : "🔓 마스킹 적용";
}
$("#btnMask").addEventListener("click", () => {
  masked = !masked;
  updateMaskButton();
  renderList();
  /* 신규 뷰(링크·수익)에도 동일한 마스킹 규칙을 즉시 반영 */
  if (loadedView.links) renderLinks();
  if (loadedView.revenue) renderRevenue();
  fillMemberSelects();
  /* 상세 모달이 열려 있으면 회원ID 표기도 즉시 새 규칙으로 다시 그린다
     (입력값은 건드리지 않는다 — 편집 중인 내용을 잃으면 안 되기 때문) */
  if (currentDetail && $("#detailModal").classList.contains("show")) renderDetailMeta(currentDetail);
  showToast(masked ? "개인정보가 마스킹 처리되었습니다." : "개인정보가 표시됩니다. 업무 목적 외 열람에 유의하세요.");
});

/* ---------- 목록 조회 / 검색 ---------- */
async function loadList() {
  setLoading(true, "목록을 불러오는 중…");
  try {
    const q = $("#searchInput").value.trim();
    const result = await api("list", { q, field: $("#searchField").value });
    records = result.records || [];
    /* 검색어가 없는 조회 = 전체 목록이므로 링크·수익 뷰의 기준 데이터로 재사용 */
    if (!q) allMembers = [...records];
    paging.app.page = 1;
    prunePickedIds();     // 목록에서 사라진 id 는 선택 해제
    fillMemberSelects();  // 링크/수익 뷰의 인플루언서 선택지 갱신
    renderList();
    if (!q) renderAppDashboard(); // 대시보드는 전체 기준 수치 유지
  } catch (err) {
    showToast(err.message);
  } finally {
    setLoading(false);
  }
}

/* =========================================================
 * 비밀번호 미설정 회원 필터
 *  - 기존 회원 / 관리자 등록 회원은 비밀번호가 없어 로그인할 수 없습니다.
 *    관리자가 이들을 찾아 비밀번호를 지정해 줘야 하므로 요약 + 필터를 제공합니다.
 * ========================================================= */
let pwNoneFilter = false;

function pwNoneRecords() {
  return records.filter((r) => !r.hasPassword);
}

/** 현재 목록에 실제로 표시할 레코드 (필터 반영) */
function visibleRecords() {
  return pwNoneFilter ? pwNoneRecords() : records;
}

function renderPwNoneChip() {
  const chip = $("#statPwNone");
  if (!chip) return;
  const n = pwNoneRecords().length;
  if (!records.length || (!n && !pwNoneFilter)) { chip.hidden = true; chip.className = "pw-none-chip"; return; }
  chip.hidden = false;
  chip.className = "pw-none-chip" + (pwNoneFilter ? " is-on" : "");
  chip.textContent = pwNoneFilter
    ? "비밀번호 미설정 " + n + "명 · 필터 해제"
    : "비밀번호 미설정 " + n + "명";
}

$("#statPwNone").addEventListener("click", () => {
  pwNoneFilter = !pwNoneFilter;
  paging.app.page = 1;
  renderList();
  showToast(pwNoneFilter
    ? "비밀번호가 지정되지 않은 회원만 표시합니다. 행을 열어 비밀번호를 지정해 주세요."
    : "전체 신청 내역을 표시합니다.");
});

function renderList() {
  const tbody = $("#listBody");
  tbody.innerHTML = "";
  const view = visibleRecords();
  $("#statTotal").innerHTML = pwNoneFilter
    ? "비밀번호 미설정 <b>" + view.length + "</b>건 / 총 " + records.length + "건"
    : "총 <b>" + records.length + "</b>건";
  $("#emptyMsg").style.display = view.length ? "none" : "";
  renderPwNoneChip();

  const { rows, start, totalPages } = pageSlice(view, paging.app);
  $("#appPageInfo").textContent = view.length
    ? (start + 1) + "–" + (start + rows.length) + " / " + view.length + "건 · " + paging.app.page + "/" + totalPages + " 페이지"
    : "0건";
  $("#appPrev").disabled = paging.app.page <= 1;
  $("#appNext").disabled = paging.app.page >= totalPages;

  rows.forEach((r, i) => {
    const gi = start + i; // 전체 기준 인덱스
    const tr = document.createElement("tr");
    if (selectedIds.has(r.id)) tr.classList.add("row-selected");

    /* 선택 체크박스 (행 클릭 = 상세 열기 이므로 이벤트 분리) */
    const tdChk = document.createElement("td");
    tdChk.className = "check-cell";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "row-check";
    chk.checked = selectedIds.has(r.id);
    chk.setAttribute("aria-label", (r.nickname || r.name || "신청") + " 선택");
    chk.addEventListener("click", (e) => e.stopPropagation());
    chk.addEventListener("change", () => {
      if (chk.checked) selectedIds.add(r.id); else selectedIds.delete(r.id);
      tr.classList.toggle("row-selected", chk.checked);
      syncSelectionUI();
    });
    tdChk.addEventListener("click", (e) => e.stopPropagation());
    tdChk.appendChild(chk);
    tr.appendChild(tdChk);

    /* No. (신청 순번: 오래된 신청이 1번) */
    const tdNo = document.createElement("td");
    tdNo.className = "no";
    tdNo.textContent = view.length - gi;
    tr.appendChild(tdNo);

    /* 신청일시 (년월일 시분초 전체 표시 · 영문 Date 문자열도 방어적으로 변환) */
    const tdDt = document.createElement("td");
    tdDt.className = "dt";
    tdDt.textContent = fmtStamp(r.submittedAt);
    tr.appendChild(tdDt);

    /* LFmall ID (Legacy: v2.0부터 미수집. 기존 데이터만 표시) */
    const tdLf = document.createElement("td");
    tdLf.style.fontWeight = r.lfmallId ? "700" : "500";
    if (!r.lfmallId) tdLf.style.color = "var(--muted)";
    tdLf.textContent = r.lfmallId || "-";
    tr.appendChild(tdLf);

    [r.nickname || "-", disp.name(r.name), disp.email(r.email), disp.phone(r.phone)].forEach((text) => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    });

    const tdBiz = document.createElement("td");
    tdBiz.innerHTML = r.bizStatus === "사업자 있음"
      ? '<span class="badge badge-yes">있음</span>'
      : r.bizStatus === "사업자 없음"
        ? '<span class="badge badge-no">없음</span>'
        : '<span class="badge badge-no">-</span>';
    tr.appendChild(tdBiz);

    /* 수수료율 (미설정이면 "-") */
    const tdRate = document.createElement("td");
    tdRate.className = "rate-cell" + (r.commissionRate === null || r.commissionRate === undefined ? " none" : "");
    tdRate.textContent = fmtRate(r.commissionRate);
    tr.appendChild(tdRate);

    /* 로그인 비밀번호 설정 여부 */
    const tdPw = document.createElement("td");
    const pwBadge = document.createElement("span");
    pwBadge.className = "badge " + (r.hasPassword ? "badge-yes" : "badge-no");
    pwBadge.textContent = r.hasPassword ? "설정됨" : "미설정";
    if (r.hasPassword && r.pwUpdatedAt) pwBadge.title = "최종 변경: " + fmtPwStamp(r.pwUpdatedAt);
    if (!r.hasPassword) pwBadge.title = "비밀번호가 없어 이 회원은 로그인할 수 없습니다. 행을 열어 지정해 주세요.";
    tdPw.appendChild(pwBadge);
    tr.appendChild(tdPw);

    /* 대표채널 (v2.1: 서버 21열 primaryChannelType 우선) */
    const tdPri = document.createElement("td");
    tdPri.className = "primary-cell";
    tdPri.appendChild(buildPrimaryChannel(r));
    tr.appendChild(tdPri);

    /* SNS 채널 아이콘 (v2.1: snsByType 우선 · 없으면 snsText 파싱 폴백) */
    const tdSns = document.createElement("td");
    tdSns.appendChild(buildSnsIcons(r));
    tr.appendChild(tdSns);

    /* 첨부 (클릭 시 다운로드) */
    const tdFile = document.createElement("td");
    if (r.files && r.files.length) {
      const badge = document.createElement("span");
      badge.className = "badge badge-file";
      badge.textContent = "⬇ " + r.files.length + "개";
      badge.title = "클릭 시 다운로드: " + r.files.map((f) => f.name).join(", ");
      badge.addEventListener("click", (e) => {
        e.stopPropagation(); /* 행 클릭(상세)과 분리 */
        downloadFiles(r.files);
        showToast("첨부파일 " + r.files.length + "개 다운로드를 시작합니다.");
      });
      tdFile.appendChild(badge);
    } else {
      tdFile.textContent = "-";
    }
    tr.appendChild(tdFile);

    const tdPlas = document.createElement("td");
    tdPlas.innerHTML = r.plasInfo
      ? '<span class="badge badge-yes">등록</span>'
      : '<span class="badge badge-no">미등록</span>';
    tr.appendChild(tdPlas);

    /* 관리 메모 */
    const tdMemo = document.createElement("td");
    tdMemo.className = "memo-cell";
    tdMemo.textContent = r.memo || "-";
    if (r.memo) tdMemo.title = r.memo;
    tr.appendChild(tdMemo);

    tr.addEventListener("click", () => openDetail(r.id));
    tbody.appendChild(tr);
  });

  syncSelectionUI();
}

/* =========================================================
 * 다중 선택 / 일괄 작업 툴바
 *  - 선택 상태는 id 기준으로 유지되어 페이지를 이동해도 보존됩니다.
 *  - 전체선택 체크박스는 '현재 페이지의 행'만 대상으로 합니다.
 * ========================================================= */
function currentPageIds() {
  return pageSlice(visibleRecords(), paging.app).rows.map((r) => r.id);
}

/* 목록 재조회로 사라진 id 정리 */
function prunePickedIds() {
  const alive = new Set(records.map((r) => r.id));
  [...selectedIds].forEach((id) => { if (!alive.has(id)) selectedIds.delete(id); });
}

function syncSelectionUI() {
  const n = selectedIds.size;
  $("#bulkCount").textContent = n;
  $("#bulkBar").classList.toggle("show", n > 0);

  const pageIds = currentPageIds();
  const checkedOnPage = pageIds.filter((id) => selectedIds.has(id)).length;
  const all = $("#checkAll");
  all.checked = pageIds.length > 0 && checkedOnPage === pageIds.length;
  all.indeterminate = checkedOnPage > 0 && checkedOnPage < pageIds.length;
}

function clearSelection() {
  selectedIds.clear();
  renderList();
}

$("#checkAll").addEventListener("change", () => {
  const on = $("#checkAll").checked;
  currentPageIds().forEach((id) => { if (on) selectedIds.add(id); else selectedIds.delete(id); });
  renderList();
});
$("#btnBulkClear").addEventListener("click", () => {
  clearSelection();
  showToast("선택이 해제되었습니다.");
});

/* =========================================================
 * 수수료 일괄 입력 (setCommission)
 * ========================================================= */
$("#btnBulkCommission").addEventListener("click", () => {
  if (!selectedIds.size) { showToast("대상 인플루언서를 선택해 주세요."); return; }
  $("#cm-target").textContent = "선택한 " + selectedIds.size + "명에게 동일한 수수료율을 적용합니다.";
  $("#cm-rate").value = "";
  openModal("#commissionModal");
  setTimeout(() => $("#cm-rate").focus(), 60);
});

$("#btnCommissionApply").addEventListener("click", async () => {
  const raw = $("#cm-rate").value.trim();
  if (raw === "") { showToast("수수료율을 입력해 주세요."); $("#cm-rate").focus(); return; }
  const rate = Number(raw);
  if (isNaN(rate) || rate < 0 || rate > 100) {
    showToast("수수료율은 0 ~ 100 사이의 숫자로 입력해 주세요."); $("#cm-rate").focus(); return;
  }
  const ids = [...selectedIds];
  setLoading(true, "수수료를 적용하는 중…");
  try {
    const result = await api("setCommission", { ids, rate });
    closeModal("#commissionModal");
    const applied = (result.applied === undefined) ? ids.length : result.applied;
    showToast(applied + "명에게 수수료 " + rate + "% 를 적용했습니다.");
    allMembers = [];              /* 수수료율이 바뀌었으므로 전체 목록 캐시 무효화 */
    await loadList();
    if (loadedView.revenue) await loadRevenue(); /* 수익 그리드의 수수료율도 갱신 */
  } catch (err) {
    showToast(err.message);
  } finally {
    setLoading(false);
  }
});

/* ---------- 신청 내역 대시보드 (검색 없이 전체 조회일 때 갱신) ---------- */
function renderAppDashboard() {
  $("#tileAppTotal").innerHTML = records.length + "<small>명</small>";
  $("#tilePlas").innerHTML = records.filter((r) => r.plasInfo).length + "<small>건</small>";
  const counts = { instagram: 0, youtube: 0, x: 0, tiktok: 0 };
  records.forEach((r) => {
    /* v2.1 : snsByType 우선 (폴백은 channelsOf 내부에서 처리) */
    const keys = new Set(channelsOf(r).map((c) => c.type));
    keys.forEach((k) => { if (hasKey(counts, k)) counts[k]++; });
  });
  const box = $("#tileSns");
  box.innerHTML = "";
  Object.keys(counts).forEach((k) => {
    const item = document.createElement("span");
    item.className = "item";
    item.innerHTML = '<span class="sns-ico ' + k + '">' + SNS_ICONS[k] + "</span><b>" + counts[k] + "</b>";
    box.appendChild(item);
  });
  $("#navAppCnt").textContent = records.length;
}

$("#btnSearch").addEventListener("click", loadList);
$("#searchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") loadList(); });

/* ---------- 상세 / 수정 / 추가 모달 ---------- */
function openModal(id) { const m = $(id); m.classList.add("show"); m.setAttribute("aria-hidden", "false"); }
function closeModal(id) { const m = $(id); m.classList.remove("show"); m.setAttribute("aria-hidden", "true"); }
$$(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest("[data-close]")) {
      overlay.classList.remove("show");
      overlay.setAttribute("aria-hidden", "true");
    }
  });
});

function fillForm(r) {
  $("#f-id").value = r.id || "";
  $("#f-lfmallId").value = r.lfmallId || "";
  /* LFmall ID 는 Legacy 항목: 신규 등록(+ 신청 추가) 모달에서는 노출하지 않는다 */
  $("#lfmallIdField").style.display = r.id ? "" : "none";
  $("#f-commissionRate").value =
    (r.commissionRate === null || r.commissionRate === undefined) ? "" : r.commissionRate;
  $("#f-name").value = r.name || "";
  $("#f-nickname").value = r.nickname || "";
  $("#f-email").value = r.email || "";
  $("#f-phone").value = r.phone || "";
  $("#f-bizStatus").value = r.bizStatus || "";
  $("#f-categories").value = r.categories || "";
  $("#f-snsText").value = r.snsText || "";
  renderSnsByType(r);   /* v2.1 : 유형별 표시(읽기 전용) — 원본 textarea 는 편집용으로 유지 */
  $("#f-plasInfo").value = r.plasInfo || "";
  $("#f-memo").value = r.memo || "";
  const fileBox = $("#f-files");
  fileBox.innerHTML = "";
  if (r.files && r.files.length) {
    r.files.forEach((f) => {
      /* 클릭 즉시 다운로드 (Drive 직접 다운로드 링크) */
      const a = document.createElement("a");
      a.href = fileDownloadUrl(f);
      a.target = "_blank"; a.rel = "noopener";
      a.title = "클릭 시 즉시 다운로드";
      a.textContent = "⬇ " + f.name;
      fileBox.appendChild(a);
    });
  } else {
    fileBox.innerHTML = '<span style="font-size:13px;color:#8A8A8A;">첨부파일 없음</span>';
  }
  renderDetailMeta(r);
}

/* [v2.2] 상세 모달 메타 — 회원ID(=이메일)는 마스킹 상태를 따른다.
   서버 호출에는 항상 #f-id 의 '원본' 값을 쓴다. */
function renderDetailMeta(r) {
  r = r || {};
  $("#metaInfo").textContent = r.id
    ? "회원ID: " + disp.memberId(r.id, r.memberIdMasked) +
      " · 신청일시: " + fmtStamp(r.submittedAt) + (r.updatedAt ? " · 최근 수정: " + fmtStamp(r.updatedAt) : "")
    : "";
}

/* =========================================================
 * 상세 모달 휴대폰번호 자동 하이픈
 * ---------------------------------------------------------
 * 하이픈 없는 "01012345678" 로 저장하면 시트가 숫자로 변환해 앞자리 0 이 사라지고
 * 휴대폰 로그인·중복 확인이 깨집니다. 입력 단계에서 형식을 고정합니다.
 * ========================================================= */
function formatPhoneInput(el) {
  if (!el) return;
  const raw = el.value;
  const formatted = (typeof window.LFAuth !== "undefined" && LFAuth.formatPhone)
    ? LFAuth.formatPhone(raw)
    : raw.replace(/[^0-9]/g, "").replace(/^(\d{3})(\d{3,4})(\d{0,4}).*$/, "$1-$2-$3").replace(/-$/, "");
  if (formatted === raw) return;
  const atEnd = el.selectionStart === raw.length;
  el.value = formatted;
  if (atEnd) { try { el.setSelectionRange(formatted.length, formatted.length); } catch (e) { /* 무시 */ } }
}

$("#f-phone").addEventListener("input", () => formatPhoneInput($("#f-phone")));

function openDetail(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  currentDetail = r;
  $("#modalTitle").textContent = "신청 상세 / 수정";
  $("#btnDelete").style.display = "";
  fillForm(r);
  setupPasswordSection(r);
  openModal("#detailModal");
}

$("#btnAdd").addEventListener("click", () => {
  currentDetail = null;
  $("#modalTitle").textContent = "신청 추가 (관리자 등록)";
  $("#btnDelete").style.display = "none";
  fillForm({});
  setupPasswordSection(null);
  openModal("#detailModal");
});

/* =========================================================
 * [v2.2] 회원ID(=이메일) 변경 처리
 * ---------------------------------------------------------
 *  회원 PK 가 이메일이므로 상세 모달에서 이메일을 바꿔 저장하면 회원ID 자체가 바뀐다.
 *  · 저장 전  : 확인 모달로 연쇄 갱신 사실을 알린다.
 *  · 저장 후  : update 응답의 새 id 로 로컬 상태를 교체하고 목록을 재조회한다.
 *               (교체하지 않으면 이후 링크/수익/삭제가 '대상을 찾을 수 없습니다' 가 된다)
 * ========================================================= */

/* 이메일을 이 값으로 저장하면 회원ID 가 바뀌는가?
   (신규 등록은 대상이 아니고, 이메일을 비워 보내면 서버가 EMAIL_REQUIRED 로 판단한다) */
function memberIdWillChange(id, email) {
  const cur = normEmailKey(id);
  const next = normEmailKey(email);
  if (!cur || !next) return false;
  return cur !== next;
}

/* 회원ID 가 바뀌었을 때 화면이 들고 있던 옛 id 를 전부 교체한다. */
function replaceMemberIdLocally(oldId, newId) {
  if (!oldId || !newId || oldId === newId) return;
  if (selectedIds.has(oldId)) { selectedIds.delete(oldId); selectedIds.add(newId); }
  const filter = $("#linkMemberFilter");
  if (filter && filter.value === oldId) filter.value = newId;
  const lkMember = $("#lk-member");
  if (lkMember && lkMember.value === oldId) lkMember.value = newId;
  /* 마스킹본은 옛 이메일 기준이므로 비워서 새 id 기준으로 다시 계산되게 한다 */
  links.forEach((l) => { if (String(l.memberId) === oldId) { l.memberId = newId; l.memberIdMasked = ""; } });
  revRows.forEach((r) => { if (String(r.id) === oldId) { r.id = newId; r.idMasked = ""; } });
  loadedView.links = false;
  loadedView.revenue = false;
}

/* 회원ID 가 바뀌면 링크/수익 뷰의 조회 결과도 옛 id 기준이므로 다시 받는다. */
async function reloadViewsAfterMemberIdChange() {
  if (currentView === "links") { loadedView.links = true; await loadLinks(); }
  else if (currentView === "revenue") { loadedView.revenue = true; await loadRevenue(); }
}

/* CASCADE_FAILED : 부분 갱신이 남았을 수 있다 → 재시도 금지 + 담당자 확인 요청 */
function showCascadeFailure(message) {
  $("#cascadeMsg").textContent = message ||
    "이메일 변경 중 오류가 발생했고 일부 데이터를 되돌리지 못했습니다.";
  $("#cascadeDetail").textContent =
    "신청내역·링크관리·수익내역의 회원ID 가 서로 다른 값으로 남아 있을 수 있습니다. " +
    "데이터가 불완전할 수 있으니 같은 저장을 다시 시도하지 마시고, 반드시 담당자에게 확인을 요청해 주세요. " +
    "(확인 전까지 해당 회원의 링크·수익 등록을 중단해 주세요.)";
  openModal("#cascadeModal");
}

let pendingSave = null;   /* 회원ID 변경 확인 모달이 대기 중인 저장 작업 */

/* 저장 (추가 or 수정) */
async function saveDetail(id, payload) {
  setLoading(true, "저장 중…");
  try {
    const res = id ? await api("update", { id, ...payload }) : await api("create", payload);
    closeModal("#detailModal");

    /* 서버가 알려 준 '변경 후 회원ID' 를 신뢰한다 (memberIdChanged 는 서버 판정) */
    const newId = res && res.id ? String(res.id) : "";
    const idChanged = !!(id && newId && newId !== String(id));
    if (idChanged) replaceMemberIdLocally(String(id), newId);

    showToast(idChanged
      ? "저장되었습니다. 회원ID가 변경되어 목록을 다시 불러옵니다."
      : "저장되었습니다.");
    currentDetail = null;
    allMembers = []; /* 이름·활동명·수수료율·회원ID 변경 가능 → 전체 목록 캐시 무효화 */
    await loadList();
    if (idChanged) await reloadViewsAfterMemberIdChange();
  } catch (err) {
    if (err && err.code === "CASCADE_FAILED") showCascadeFailure(err.message);
    else showToast(err.message);
  } finally {
    setLoading(false);
  }
}

$("#btnSave").addEventListener("click", () => {
  const id = $("#f-id").value;   /* ★ 언제나 '원본' 회원ID. 마스킹본을 담지 않는다 */
  const rateRaw = $("#f-commissionRate").value.trim();
  if (rateRaw !== "") {
    const rv = Number(rateRaw);
    if (isNaN(rv) || rv < 0 || rv > 100) {
      showToast("수수료율은 0 ~ 100 사이의 숫자로 입력해 주세요."); $("#f-commissionRate").focus(); return;
    }
  }
  const payload = {
    name: $("#f-name").value.trim(),
    nickname: $("#f-nickname").value.trim(),
    email: $("#f-email").value.trim(),
    phone: $("#f-phone").value.trim(),
    bizStatus: $("#f-bizStatus").value,
    categories: $("#f-categories").value.trim(),
    snsText: $("#f-snsText").value.trim(),
    plasInfo: $("#f-plasInfo").value.trim(),
    memo: $("#f-memo").value.trim(),
    commissionRate: rateRaw === "" ? null : Number(rateRaw)
  };
  /* LFmall ID 는 Legacy(읽기 전용) — 기존 건 수정 시에만 원본 값을 그대로 유지 전송 */
  if (id) payload.lfmallId = $("#f-lfmallId").value.trim();
  if (!payload.nickname && !payload.name) { showToast("이름 또는 활동명을 입력해 주세요."); return; }

  /* [v2.2] 이메일을 바꾸면 회원ID 가 바뀐다 — 저장 전에 반드시 확인받는다 */
  if (id && memberIdWillChange(id, payload.email)) {
    $("#memberIdMsg").textContent = "회원ID가 변경됩니다. 연결된 링크·수익 데이터도 함께 갱신됩니다.";
    $("#memberIdDetail").textContent =
      "현재 회원ID: " + disp.memberId(id, currentDetail && currentDetail.memberIdMasked) +
      "  →  변경 후: " + disp.memberId(normEmailKey(payload.email)) + "\n" +
      "변경 후 해당 회원은 다시 로그인해야 하며, 다른 창에 열려 있는 목록은 새로고침이 필요합니다.";
    pendingSave = () => saveDetail(id, payload);
    openModal("#memberIdModal");
    return;
  }
  saveDetail(id, payload);
});

/* 취소·오버레이 클릭으로 닫히면 대기 중인 저장 작업을 버린다 (입력값이 닫힌 모달에 남지 않도록) */
$("#memberIdModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget || (e.target.closest && e.target.closest("[data-close]"))) pendingSave = null;
});

$("#btnMemberIdConfirm").addEventListener("click", () => {
  const run = pendingSave;
  pendingSave = null;
  closeModal("#memberIdModal");
  if (typeof run === "function") run();
});

/* =========================================================
 * 회원 로그인 비밀번호 변경 (adminSetPassword)
 *  - 평문 비밀번호는 서버로 전송하지 않습니다.
 *    LFAuth.makeCredential(pw) 로 { csalt, clientHash } 만 만들어 전송합니다.
 * ========================================================= */
function authReady() { return typeof window.LFAuth !== "undefined"; }
function pwSecureOk() { return authReady() && LFAuth.isSecureContextOk(); }

/* "2026-07-01 10:00:00" → "2026-07-01 10:00"
   서버가 정상이면 항상 'YYYY-MM-DD HH:mm:ss' 로 내려오지만,
   구버전 서버·수동 편집으로 "Tue Jul 01 2026 10:00:00 GMT+0900 (한국 표준시)" 같은
   영문 Date 문자열이 섞여 들어와도 KST 기준으로 변환해 표시한다. */
function fmtPwStamp(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return "";
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
    const hh = p.hour === "24" ? "00" : p.hour;
    return `${p.year}-${p.month}-${p.day} ${hh}:${p.minute}`;
  }
  return s;
}

/* 목록·상세의 일시 표기 : 'YYYY-MM-DD HH:mm:ss' 유지, 영문 Date 문자열은 변환 */
function fmtStamp(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return "-";
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
  const hh = p.hour === "24" ? "00" : p.hour;
  return `${p.year}-${p.month}-${p.day} ${hh}:${p.minute}:${p.second}`;
}

function renderPwState(r) {
  const el = $("#pwState");
  el.textContent = "";
  const badge = document.createElement("span");
  badge.className = "badge " + (r.hasPassword ? "badge-yes" : "badge-no");
  badge.textContent = r.hasPassword ? "설정됨" : "미설정";
  el.appendChild(badge);
  const txt = document.createElement("span");
  txt.style.marginLeft = "8px";
  txt.textContent = r.hasPassword
    ? (r.pwUpdatedAt ? "최종 변경 " + fmtPwStamp(r.pwUpdatedAt) : "최종 변경일시 정보 없음")
    : "아직 로그인 비밀번호가 지정되지 않았습니다.";
  el.appendChild(txt);
}

function resetPwToggles() {
  $$(".pw-toggle").forEach((b) => {
    const input = $("#" + b.dataset.pw);
    if (input) input.type = "password";
    b.textContent = "표시";
  });
}

function updatePwMeter() {
  const pw = $("#f-pw1").value;
  const pw2 = $("#f-pw2").value;
  const bar = $("#pwBar");
  const msg = $("#pwMsg");
  bar.className = "";
  if (!pw) { msg.className = "pw-msg"; msg.textContent = ""; return; }
  if (!authReady()) { msg.className = "pw-msg"; msg.textContent = "인증 모듈(auth.js)을 불러오지 못했습니다."; return; }

  const ctx = currentDetail ? { email: currentDetail.email, phone: currentDetail.phone } : {};
  const v = LFAuth.validatePassword(pw, ctx);
  if (!v.ok) { msg.className = "pw-msg"; msg.textContent = v.messages[0]; return; }
  bar.className = "lv" + v.level;
  if (pw2 && pw !== pw2) { msg.className = "pw-msg"; msg.textContent = "비밀번호가 일치하지 않습니다."; return; }
  msg.className = "pw-msg ok";
  msg.textContent = "사용 가능한 비밀번호입니다. (강도: " + LFAuth.strengthLabel(v.level) + ")";
}

/* 상세 모달을 열 때마다 비밀번호 섹션 초기화 */
function setupPasswordSection(r) {
  const box = $("#pwBox");
  $("#f-pw1").value = "";
  $("#f-pw2").value = "";
  resetPwToggles();
  updatePwMeter();

  /* 신규 등록(+ 신청 추가) 모드에서는 대상 회원이 없으므로 숨김 */
  if (!r || !r.id) { box.style.display = "none"; return; }
  box.style.display = "";
  renderPwState(r);

  const ok = pwSecureOk();
  box.classList.toggle("disabled", !ok);
  const warn = $("#pwInsecure");
  warn.style.display = ok ? "none" : "";
  warn.textContent = ok
    ? ""
    : (authReady() ? LFAuth.INSECURE_MSG : "인증 모듈(auth.js)을 불러오지 못해 비밀번호를 변경할 수 없습니다.");
}

$$(".pw-toggle").forEach((b) => {
  b.addEventListener("click", () => {
    const input = $("#" + b.dataset.pw);
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    b.textContent = show ? "숨김" : "표시";
  });
});
$("#f-pw1").addEventListener("input", updatePwMeter);
$("#f-pw2").addEventListener("input", updatePwMeter);

$("#btnPwChange").addEventListener("click", async () => {
  if (!currentDetail || !currentDetail.id) { showToast("먼저 인플루언서를 선택해 주세요."); return; }
  if (!pwSecureOk()) {
    showToast("보안 연결(HTTPS) 환경에서만 비밀번호를 변경할 수 있습니다.");
    return;
  }
  const pw = $("#f-pw1").value;
  const pw2 = $("#f-pw2").value;
  if (!pw || !pw2) { showToast("새 비밀번호를 두 칸 모두 입력해 주세요."); return; }
  if (pw !== pw2) { showToast("비밀번호가 일치하지 않습니다."); $("#f-pw2").focus(); return; }
  const v = LFAuth.validatePassword(pw, { email: currentDetail.email, phone: currentDetail.phone });
  if (!v.ok) { showToast(v.messages[0]); $("#f-pw1").focus(); return; }

  setLoading(true, "비밀번호를 변경하는 중…");
  try {
    /* PBKDF2-SHA256(120,000회) — 평문은 이 브라우저를 벗어나지 않습니다. */
    const cred = await LFAuth.makeCredential(pw);
    const result = await api("adminSetPassword", {
      memberId: currentDetail.id, csalt: cred.csalt, clientHash: cred.clientHash
    });
    currentDetail.hasPassword = true;
    currentDetail.pwUpdatedAt = result.pwUpdatedAt || "";
    $("#f-pw1").value = "";
    $("#f-pw2").value = "";
    resetPwToggles();
    updatePwMeter();
    renderPwState(currentDetail);
    renderList(); /* 목록의 비밀번호 상태 컬럼 갱신 */
    showToast("비밀번호가 변경되었습니다. 인플루언서에게 안내해 주세요.");
  } catch (err) {
    showToast(err.message);
  } finally {
    setLoading(false);
  }
});

/* 삭제 (확인 모달 → 파기) — 신청/초대 공용 */
$("#btnDelete").addEventListener("click", () => {
  pendingDelete = { type: "app", id: $("#f-id").value };
  $("#confirmMsg").innerHTML = '이 신청 내역을 삭제할까요?<br/><b style="color:#E8467C;">DB의 데이터와 Drive에 보관된 첨부파일이 함께 파기되며, 되돌릴 수 없습니다.</b>';
  openModal("#confirmModal");
});
$("#btnDeleteConfirm").addEventListener("click", async () => {
  if (!pendingDelete) return;
  closeModal("#confirmModal");
  setLoading(true, "삭제 중…");
  try {
    if (pendingDelete.type === "app") {
      await api("delete", { id: pendingDelete.id });
      closeModal("#detailModal");
      showToast("삭제되었습니다. (첨부파일 포함 파기)");
      selectedIds.delete(pendingDelete.id);
      allMembers = [];
      links = [];
      loadedView.links = false;
      loadedView.revenue = false;
      await loadList();
    } else if (pendingDelete.type === "link") {
      await api("linkDelete", { id: pendingDelete.id });
      closeModal("#linkModal");
      showToast("링크가 삭제되었습니다.");
      await loadLinks();
    } else {
      await api("inviteDelete", { id: pendingDelete.id });
      closeModal("#inviteModal");
      showToast("초대 내역이 삭제되었습니다.");
      await loadInvites();
    }
    pendingDelete = null;
  } catch (err) {
    showToast(err.message);
  } finally {
    setLoading(false);
  }
});

/* =========================================================
 * 좌측 앵커 메뉴: 신청 내역 / 초대 내역 / 링크 관리 / 수익 관리 전환
 * ========================================================= */
function switchView(view) {
  currentView = view;
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $("#viewApplications").style.display = view === "applications" ? "" : "none";
  $("#viewInvites").style.display = view === "invites" ? "" : "none";
  $("#viewLinks").style.display = view === "links" ? "" : "none";
  $("#viewRevenue").style.display = view === "revenue" ? "" : "none";

  /* 신규 뷰는 최초 진입 시 1회 자동 로드 */
  if (view === "links" && !loadedView.links) { loadedView.links = true; loadLinks(); }
  if (view === "revenue" && !loadedView.revenue) { loadedView.revenue = true; loadRevenue(); }
}
$$(".nav-item").forEach((b) =>
  b.addEventListener("click", () => switchView(b.dataset.view))
);

/* ---------- 페이징 이벤트 ---------- */
$("#appPageSize").addEventListener("change", () => { paging.app.size = +$("#appPageSize").value; paging.app.page = 1; renderList(); });
$("#appPrev").addEventListener("click", () => { paging.app.page--; renderList(); });
$("#appNext").addEventListener("click", () => { paging.app.page++; renderList(); });
$("#invPageSize").addEventListener("change", () => { paging.inv.size = +$("#invPageSize").value; paging.inv.page = 1; renderInvites(); });
$("#invPrev").addEventListener("click", () => { paging.inv.page--; renderInvites(); });
$("#invNext").addEventListener("click", () => { paging.inv.page++; renderInvites(); });
$("#linkPageSize").addEventListener("change", () => { paging.link.size = +$("#linkPageSize").value; paging.link.page = 1; renderLinks(); });
$("#linkPrev").addEventListener("click", () => { paging.link.page--; renderLinks(); });
$("#linkNext").addEventListener("click", () => { paging.link.page++; renderLinks(); });

/* =========================================================
 * 링크 관리 (linkList / linkCreate / linkUpdate / linkDelete / linkBulkCreate)
 * ========================================================= */

/* 전체 인플루언서 목록 확보 (링크·수익 뷰 공용) */
async function ensureMembers() {
  if (allMembers.length) return allMembers;
  const result = await api("list", { q: "", field: "all" });
  allMembers = result.records || [];
  fillMemberSelects();
  return allMembers;
}

/* 인플루언서 선택 셀렉트 채우기 (검색어로 필터 가능) */
function fillMemberSelects() {
  const q = ($("#linkMemberSearch").value || "").trim().toLowerCase();
  const base = allMembers.length ? allMembers : records;
  const sorted = [...base].sort((a, b) =>
    (a.nickname || a.name || "").localeCompare(b.nickname || b.name || "", "ko"));

  /* 링크 관리 뷰 상단 필터 (전체 보기 포함) */
  const filter = $("#linkMemberFilter");
  const keep = filter.value;
  filter.textContent = "";
  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "전체 보기";
  filter.appendChild(allOpt);

  sorted.forEach((r) => {
    const label = (r.nickname || "(활동명 없음)") + " · " + disp.name(r.name);
    const hay = ((r.nickname || "") + " " + (r.name || "")).toLowerCase();
    if (!q || hay.indexOf(q) !== -1) {
      const o = document.createElement("option");
      o.value = r.id;
      o.textContent = label;
      filter.appendChild(o);
    }
  });

  if ([...filter.options].some((o) => o.value === keep)) filter.value = keep;

  /* v2.1 : 링크 추가 모달의 인플루언서 선택은 셀렉트 → 텍스트 검색 자동완성으로 대체되었다.
     선택 상태(칩)는 유지하고 표시 문자열만 현재 마스킹 규칙으로 다시 그린다. */
  renderMemberChip();
  if (memberAc.open) renderAcList();
}
$("#linkMemberSearch").addEventListener("input", () => fillMemberSelects());

/* =========================================================
 * v2.1 : 링크 추가 모달 — 인플루언서 텍스트 검색(자동완성)
 * ---------------------------------------------------------
 *  · 활동명 / 이름 / 이메일 부분 일치 (대소문자 무시) — 최대 10건 표시
 *  · ↑ ↓ 이동, Enter 선택, Esc 닫기 / 선택 시 칩(chip) + ✕ 로 해제
 *  · [전체 목록] 버튼으로 기존 셀렉트처럼 전 목록을 펼쳐 볼 수 있다.
 *  · 검색 대상은 '원본 값' 이다. 마스킹 상태에서도 실제 이메일로 찾을 수 있어야 하기 때문.
 *    (화면 표기는 항상 disp.* 를 거친 마스킹 값)
 * ========================================================= */
const AC_LIMIT = 10;
const memberAc = { items: [], index: -1, open: false, all: false };
/* blur 로 예약된 닫기 타이머. [전체 목록] 버튼처럼 blur 직후 다시 여는 경로에서 취소해야 한다. */
let acCloseTimer = null;
let memberPickerLocked = false;   /* 링크 '수정' 모드 : 소유자 변경 불가 */

/* 링크/수익 뷰 공용 — 활동명 기준 가나다 정렬된 전체 인플루언서 */
function memberPool() {
  const base = allMembers.length ? allMembers : records;
  return [...base].sort((a, b) =>
    (a.nickname || a.name || "").localeCompare(b.nickname || b.name || "", "ko"));
}
function acMatch(r, q) {
  if (!q) return true;
  const hay = [r.nickname, r.name, r.email].map((v) => String(v == null ? "" : v).toLowerCase()).join(" ");
  return hay.indexOf(q) !== -1;
}
function acLabel(r) { return (r.nickname || "(활동명 없음)") + " · " + disp.name(r.name); }
function acSub(r) {
  const parts = [disp.email(r.email)];
  if (r.phone) parts.push(disp.phone(r.phone));
  return parts.join(" · ");
}

function renderAcList() {
  const box = $("#lk-memberList");
  const q = ($("#lk-memberSearch").value || "").trim().toLowerCase();
  const pool = memberPool();
  const hits = memberAc.all ? pool : pool.filter((r) => acMatch(r, q));
  memberAc.items = memberAc.all ? hits : hits.slice(0, AC_LIMIT);
  box.textContent = "";

  if (!memberAc.items.length) {
    const e = document.createElement("div");
    e.className = "ac-empty";
    e.textContent = pool.length ? "검색 결과가 없습니다." : "등록된 인플루언서가 없습니다.";
    box.appendChild(e);
    memberAc.index = -1;
    return;
  }
  memberAc.items.forEach((r, i) => {
    const opt = document.createElement("div");
    opt.className = "ac-opt" + (i === memberAc.index ? " active" : "");
    opt.setAttribute("role", "option");
    opt.setAttribute("aria-selected", i === memberAc.index ? "true" : "false");
    opt.textContent = acLabel(r);
    const sub = document.createElement("small");
    sub.textContent = acSub(r);
    opt.appendChild(sub);
    /* mousedown 으로 처리해야 input 의 blur 보다 먼저 실행된다 */
    opt.addEventListener("mousedown", (e) => { e.preventDefault(); pickMember(r.id); });
    box.appendChild(opt);
  });
  if (!memberAc.all && hits.length > memberAc.items.length) {
    const more = document.createElement("div");
    more.className = "ac-empty";
    more.textContent = "검색 결과 " + hits.length + "명 중 " + memberAc.items.length +
      "명만 표시했습니다. 검색어를 더 입력하거나 [전체 목록]을 누르세요.";
    box.appendChild(more);
  }
}

function openAc(all) {
  if (memberPickerLocked) return;
  clearTimeout(acCloseTimer);   /* blur → 재오픈 경합 차단 */
  memberAc.all = !!all;
  memberAc.index = -1;
  renderAcList();
  $("#lk-memberList").classList.add("show");
  $("#lk-memberSearch").setAttribute("aria-expanded", "true");
  memberAc.open = true;
}
function closeAc() {
  clearTimeout(acCloseTimer);
  $("#lk-memberList").classList.remove("show");
  $("#lk-memberSearch").setAttribute("aria-expanded", "false");
  memberAc.open = false;
  memberAc.all = false;
  memberAc.index = -1;
}

function pickMember(id) {
  $("#lk-member").value = id || "";
  $("#lk-memberSearch").value = "";
  closeAc();
  renderMemberChip();
}
function clearMemberPick() {
  if (memberPickerLocked) return;
  $("#lk-member").value = "";
  renderMemberChip();
  $("#lk-memberSearch").focus();
}

function renderMemberChip() {
  const box = $("#lk-memberChip");
  if (!box) return;
  const id = $("#lk-member").value;
  box.textContent = "";
  if (!id) { box.style.display = "none"; return; }
  box.style.display = "";
  const m = memberOf(id);
  const chip = document.createElement("span");
  chip.className = "chip";
  const label = document.createElement("span");
  /* [v2.2] id 는 이메일 원문이다. 목록에 없는 회원도 마스킹 규칙을 그대로 적용한다. */
  label.textContent = m ? (acLabel(m) + " · " + disp.email(m.email)) : ("회원 " + disp.memberId(id) + " (목록에 없음)");
  chip.appendChild(label);
  if (!memberPickerLocked) {
    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "✕";
    x.title = "선택 해제";
    x.setAttribute("aria-label", "인플루언서 선택 해제");
    x.addEventListener("click", clearMemberPick);
    chip.appendChild(x);
  }
  box.appendChild(chip);
}

/* 링크 '수정' 모드에서는 소유자를 바꾸지 않으므로 검색 UI 를 감춘다 */
function lockMemberPicker(on) {
  memberPickerLocked = !!on;
  $("#lk-memberSearch").disabled = !!on;
  $("#lk-memberSearch").style.display = on ? "none" : "";
  $("#btnLkMemberAll").style.display = on ? "none" : "";
  $("#lk-memberHint").style.display = on ? "none" : "";
  if (on) closeAc();
  renderMemberChip();
}

$("#lk-memberSearch").addEventListener("input", () => openAc(false));
$("#lk-memberSearch").addEventListener("focus", () => openAc(false));
$("#lk-memberSearch").addEventListener("blur", () => {
  clearTimeout(acCloseTimer);
  acCloseTimer = setTimeout(closeAc, 140);   /* 옵션 클릭이 먼저 처리되도록 약간 지연 */
});
$("#lk-memberSearch").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!memberAc.open) openAc(false);
    if (!memberAc.items.length) return;
    memberAc.index += (e.key === "ArrowDown" ? 1 : -1);
    if (memberAc.index < 0) memberAc.index = memberAc.items.length - 1;
    if (memberAc.index >= memberAc.items.length) memberAc.index = 0;
    renderAcList();
    const active = $("#lk-memberList").querySelector(".ac-opt.active");
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
    return;
  }
  if (e.key === "Enter") {
    if (memberAc.open && memberAc.index >= 0 && memberAc.items[memberAc.index]) {
      e.preventDefault();
      pickMember(memberAc.items[memberAc.index].id);
    } else if (memberAc.open && memberAc.items.length === 1) {
      e.preventDefault();
      pickMember(memberAc.items[0].id);
    }
    return;
  }
  if (e.key === "Escape") closeAc();
});
$("#btnLkMemberAll").addEventListener("click", () => {
  if (memberPickerLocked) return;
  if (memberAc.open && memberAc.all) { closeAc(); return; }
  $("#lk-memberSearch").value = "";
  $("#lk-memberSearch").focus();
  openAc(true);
});

async function loadLinks() {
  setLoading(true, "링크를 불러오는 중…");
  try {
    await ensureMembers();
    const memberId = $("#linkMemberFilter").value;
    const result = await api("linkList", memberId ? { memberId } : {});
    links = result.links || [];
    paging.link.page = 1;
    renderLinks();
  } catch (err) {
    showToast(err.message);
  } finally {
    setLoading(false);
  }
}
$("#btnLinkReload").addEventListener("click", loadLinks);
$("#linkMemberFilter").addEventListener("change", loadLinks);

const LINK_STATUS = {
  active:    { label: "활성", cls: "badge-active" },
  scheduled: { label: "예정", cls: "badge-scheduled" },
  closed:    { label: "종료", cls: "badge-closed" }
};
/* 서버 문자열을 그대로 객체 키로 쓰지 않는다 (프로토타입 오염 방지) */
function linkStatusOf(status) {
  const k = String(status || "");
  return hasKey(LINK_STATUS, k) ? LINK_STATUS[k] : LINK_STATUS.closed;
}

function renderLinks() {
  const tbody = $("#linkBody");
  tbody.textContent = "";

  const total = links.length;
  const active = links.filter((l) => l.status === "active").length;
  const closed = links.filter((l) => l.status === "closed").length;
  $("#tileLinkTotal").innerHTML = total + "<small>건</small>";
  $("#tileLinkActive").innerHTML = active + "<small>건</small>";
  $("#tileLinkClosed").innerHTML = closed + "<small>건</small>";
  /* 좌측 네비 카운트는 '전체 보기' 기준으로만 갱신 (특정 인플루언서 필터 시에는 유지) */
  if (!$("#linkMemberFilter").value) $("#navLinkCnt").textContent = total;
  $("#statLinkTotal").innerHTML = "총 <b>" + total + "</b>건";
  $("#linkEmpty").style.display = total ? "none" : "";

  const { rows, start, totalPages } = pageSlice(links, paging.link);
  $("#linkPageInfo").textContent = total
    ? (start + 1) + "–" + (start + rows.length) + " / " + total + "건 · " + paging.link.page + "/" + totalPages + " 페이지"
    : "0건";
  $("#linkPrev").disabled = paging.link.page <= 1;
  $("#linkNext").disabled = paging.link.page >= totalPages;

  rows.forEach((l, i) => {
    const tr = document.createElement("tr");

    const tdNo = document.createElement("td");
    tdNo.className = "no";
    tdNo.textContent = total - (start + i);
    tr.appendChild(tdNo);

    /* 링크번호 (v2.1 : UUID → 순번 문자열) */
    const tdSeq = document.createElement("td");
    tdSeq.className = "no";
    tdSeq.textContent = l.id || "-";
    tr.appendChild(tdSeq);

    /* 인플루언서 (활동명 · 마스킹 규칙 적용된 이름) */
    const tdMember = document.createElement("td");
    tdMember.className = "member-cell";
    tdMember.textContent = memberLabel(l.memberId, l.memberName, l.memberIdMasked);
    tr.appendChild(tdMember);

    const tdName = document.createElement("td");
    tdName.textContent = l.name || "-";
    tr.appendChild(tdName);

    /* URL: 새 창 링크 + 복사 버튼
       [보안] 시트를 직접 편집해 'javascript:' 같은 위험 스킴이 들어올 수 있으므로
       href 에는 http(s) 로 검증된 값만 넣는다. (검증 실패 시 링크가 아닌 텍스트로 표기) */
    const tdUrl = document.createElement("td");
    tdUrl.className = "url-cell";
    const wrap = document.createElement("span");
    wrap.className = "url-inline";
    const safeHref = isHttpUrl(l.url) ? String(l.url).trim() : "";
    let a;
    if (safeHref) {
      a = document.createElement("a");
      a.href = safeHref;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = safeHref;
    } else {
      a = document.createElement("span");
      a.className = "url-invalid";
      a.title = "http:// 또는 https:// 로 시작하지 않는 URL 입니다.";
    }
    a.textContent = l.url || "-";
    wrap.appendChild(a);
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "icon-btn";
    copyBtn.textContent = "📋";
    copyBtn.title = "링크 URL 복사";
    copyBtn.setAttribute("aria-label", "링크 URL 복사");
    copyBtn.disabled = !safeHref;
    copyBtn.addEventListener("click", () => { if (safeHref) copyText(safeHref); });
    wrap.appendChild(copyBtn);
    tdUrl.appendChild(wrap);
    tr.appendChild(tdUrl);

    const tdIssued = document.createElement("td");
    tdIssued.className = "dt";
    tdIssued.textContent = l.issuedAt || "-";
    tr.appendChild(tdIssued);

    const tdPeriod = document.createElement("td");
    tdPeriod.className = "period-cell";
    tdPeriod.textContent = fmtPeriod(l.startAt, l.endAt);
    tr.appendChild(tdPeriod);

    const tdStatus = document.createElement("td");
    const st = linkStatusOf(l.status);
    const badge = document.createElement("span");
    badge.className = "badge " + st.cls;
    badge.textContent = st.label;
    tdStatus.appendChild(badge);
    tr.appendChild(tdStatus);

    const tdAct = document.createElement("td");
    const acts = document.createElement("span");
    acts.className = "row-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.textContent = "수정";
    editBtn.addEventListener("click", () => openLinkModal(l));
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "icon-btn danger";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => askLinkDelete(l));
    acts.appendChild(editBtn);
    acts.appendChild(delBtn);
    tdAct.appendChild(acts);
    tr.appendChild(tdAct);

    tbody.appendChild(tr);
  });
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast("링크가 복사되었습니다."))
      .catch(() => showToast("복사에 실패했습니다. 링크를 직접 선택해 주세요."));
    return;
  }
  showToast("이 브라우저에서는 자동 복사를 지원하지 않습니다.");
}

/* ---------- 링크 추가/수정 모달 ---------- */
function openLinkModal(l) {
  const isEdit = !!(l && l.id);
  $("#linkModalTitle").textContent = isEdit ? "링크 수정" : "링크 추가";
  $("#lk-id").value = isEdit ? l.id : "";
  $("#lk-member").value = isEdit ? (l.memberId || "") : ($("#linkMemberFilter").value || "");
  $("#lk-memberSearch").value = "";
  closeAc();
  lockMemberPicker(isEdit); /* 링크의 소유자는 변경하지 않는다 */
  $("#lk-name").value = isEdit ? (l.name || "") : "";
  $("#lk-url").value = isEdit ? (l.url || "") : "";
  $("#lk-start").value = isEdit ? (l.startAt || "") : todayYmd();
  $("#lk-end").value = isEdit ? (l.endAt || "") : "";
  $("#lk-memo").value = isEdit ? (l.memo || "") : "";
  $("#btnLinkDelete").style.display = isEdit ? "" : "none";
  $("#lk-meta").textContent = isEdit
    ? "등록일: " + (l.issuedAt || "-") + " · 인플루언서: " + memberLabel(l.memberId, l.memberName, l.memberIdMasked)
    : "";
  openModal("#linkModal");
}

$("#btnLinkAdd").addEventListener("click", async () => {
  try { await ensureMembers(); } catch (e) { showToast(e.message); return; }
  if (!allMembers.length) { showToast("등록된 인플루언서가 없습니다."); return; }
  openLinkModal(null);
});

/* 링크 입력값 공통 검증 → {name, url, startAt, endAt} | null */
function readLinkForm(prefix) {
  const url = $("#" + prefix + "-url").value.trim();
  const startAt = $("#" + prefix + "-start").value;
  const endAt = $("#" + prefix + "-end").value;
  if (!url) { showToast("링크 URL을 입력해 주세요."); $("#" + prefix + "-url").focus(); return null; }
  if (!isHttpUrl(url)) {
    showToast("링크 URL은 http:// 또는 https:// 로 시작해야 합니다.");
    $("#" + prefix + "-url").focus();
    return null;
  }
  if (startAt && endAt && endAt < startAt) {
    showToast("유효종료일은 유효시작일보다 빠를 수 없습니다.");
    $("#" + prefix + "-end").focus();
    return null;
  }
  return { name: $("#" + prefix + "-name").value.trim(), url, startAt, endAt };
}

$("#btnLinkSave").addEventListener("click", async () => {
  const id = $("#lk-id").value;
  const memberId = $("#lk-member").value;
  if (!id && !memberId) {
    showToast("인플루언서가 선택되지 않았습니다. 활동명·이름·이메일로 검색해 목록에서 선택하거나 [전체 목록]을 눌러 주세요.");
    $("#lk-memberSearch").focus();
    openAc(false);
    return;
  }
  const form = readLinkForm("lk");
  if (!form) return;
  const memo = $("#lk-memo").value.trim();

  setLoading(true, "저장 중…");
  try {
    if (id) await api("linkUpdate", { id, ...form, memo });
    else await api("linkCreate", { memberId, ...form, memo });
    closeModal("#linkModal");
    showToast(id ? "링크가 수정되었습니다." : "링크가 등록되었습니다.");
    await loadLinks();
    await loadList(); /* linkCount / activeLinkCount 갱신 */
  } catch (err) {
    showToast(err.message);
  } finally {
    setLoading(false);
  }
});

function askLinkDelete(l) {
  pendingDelete = { type: "link", id: l.id };
  $("#confirmMsg").textContent = "이 링크를 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.";
  openModal("#confirmModal");
}
$("#btnLinkDelete").addEventListener("click", () => {
  const id = $("#lk-id").value;
  if (!id) return;
  askLinkDelete({ id });
});

/* ---------- 링크 일괄 배포 (신청 내역 뷰의 선택 항목 대상) ---------- */
function openLinkBulkModal() {
  if (!selectedIds.size) { showToast("대상 인플루언서를 선택해 주세요."); return; }
  $("#lb-target").textContent = "선택한 " + selectedIds.size + "명에게 동일한 링크를 배포합니다.";
  $("#lb-name").value = "";
  $("#lb-url").value = "";
  $("#lb-start").value = todayYmd();
  $("#lb-end").value = "";
  openModal("#linkBulkModal");
  setTimeout(() => $("#lb-name").focus(), 60);
}
$("#btnBulkLink").addEventListener("click", openLinkBulkModal);

/* 링크 관리 뷰에서도 일괄 배포에 진입할 수 있게 한다.
   선택된 인플루언서가 없으면 선택이 가능한 [신청 내역] 뷰로 이동시킨다. */
$("#btnLinkBulkFromLinks").addEventListener("click", () => {
  if (!selectedIds.size) {
    showToast("먼저 [신청 내역]에서 배포할 인플루언서를 체크해 주세요.");
    switchView("applications");
    return;
  }
  openLinkBulkModal();
});

$("#btnLinkBulkApply").addEventListener("click", async () => {
  if (!selectedIds.size) { showToast("대상 인플루언서를 선택해 주세요."); return; }
  const form = readLinkForm("lb");
  if (!form) return;
  const memberIds = [...selectedIds];

  setLoading(true, "링크를 배포하는 중…");
  try {
    const result = await api("linkBulkCreate", { memberIds, ...form });
    closeModal("#linkBulkModal");
    const applied = (result.applied === undefined) ? memberIds.length : result.applied;
    showToast(applied + "명에게 링크를 배포했습니다.");
    if (loadedView.links) await loadLinks();
    await loadList();
  } catch (err) {
    showToast(err.message);
  } finally {
    setLoading(false);
  }
});

/* =========================================================
 * 수익 관리 (revenueList / revenueUpsert)
 *  - list 로 인플루언서 목록·수수료율·누적 총수익을,
 *    revenueList({ym}) 로 해당 월 입력값을 가져와 한 그리드로 조합합니다.
 * ========================================================= */
async function loadRevenue() {
  const ym = $("#revYm").value || currentYm();
  $("#revYm").value = ym;
  setLoading(true, "수익 내역을 불러오는 중…");
  try {
    const members = await ensureMembers();
    const result = await api("revenueList", { ym });
    const byMember = {};
    (result.revenue || []).forEach((r) => { byMember[r.memberId] = r; });

    revRows = members.map((r) => {
      const hit = byMember[r.id];
      return {
        id: r.id,
        /* v2.2 : 표시용 마스킹 회원ID (서버 호출에는 언제나 원본 id 를 쓴다) */
        idMasked: r.memberIdMasked || (hit ? hit.memberIdMasked : "") || "",
        /* v2.1 : 수익내역 시트의 순번 PK (미입력 회원은 아직 행이 없으므로 빈 문자열) */
        revId: hit ? String(hit.id || "") : "",
        name: r.name || "",
        nickname: r.nickname || "",
        rate: r.commissionRate,
        total: Number(r.totalRevenue || 0),
        saved: hit ? Number(hit.amount || 0) : null, /* null = 미입력 */
        amount: hit ? Number(hit.amount || 0) : null
      };
    });
    renderRevenue();
  } catch (err) {
    showToast(err.message);
  } finally {
    setLoading(false);
  }
}
$("#btnRevLoad").addEventListener("click", loadRevenue);

function rowChanged(row) {
  const a = row.amount === null ? null : Number(row.amount);
  const b = row.saved === null ? null : Number(row.saved);
  return a !== b;
}

/* 일괄 저장 대상 = 변경된 행 중 금액이 입력된 행 (btnRevSaveAll 의 필터와 동일해야 한다) */
function revChangedRows() {
  return revRows.filter((r) => rowChanged(r) && r.amount !== null);
}

/* [변경분 일괄 저장] 버튼 활성/문구 갱신
   · 변경 0건 → 비활성 + "변경사항 없음"
   · 변경 N건 → 활성   + "변경분 일괄 저장 (N건)" */
function updateRevSaveAllButton() {
  const btn = $("#btnRevSaveAll");
  if (!btn) return;
  const n = revChangedRows().length;
  btn.disabled = n === 0;
  btn.textContent = n ? ("\uD83D\uDCBE 변경분 일괄 저장 (" + n + "건)") : "변경사항 없음";
  btn.title = n
    ? n + "건의 변경된 행을 순차 저장합니다."
    : "변경된 행이 없습니다. 금액을 수정하면 활성화됩니다.";
}

function renderRevenue() {
  const tbody = $("#revBody");
  tbody.textContent = "";
  $("#revEmpty").style.display = revRows.length ? "none" : "";
  /* 입력값(연월)은 innerHTML 로 넣지 않는다 */
  const statRev = $("#statRevTotal");
  statRev.textContent = "";
  const strong = document.createElement("b");
  strong.textContent = revRows.length;
  statRev.appendChild(document.createTextNode("대상 "));
  statRev.appendChild(strong);
  statRev.appendChild(document.createTextNode("명 · " + ($("#revYm").value || currentYm())));
  $("#navRevCnt").textContent = revRows.length;

  revRows.forEach((row, i) => {
    const tr = document.createElement("tr");
    if (rowChanged(row)) tr.classList.add("row-changed");

    const tdNo = document.createElement("td");
    tdNo.className = "no";
    tdNo.textContent = i + 1;
    tr.appendChild(tdNo);

    /* 수익번호 (v2.1 : UUID → 순번 문자열). 아직 저장 전이면 '-' */
    const tdSeq = document.createElement("td");
    tdSeq.className = "no";
    tdSeq.textContent = row.revId || "-";
    tr.appendChild(tdSeq);

    /* 인플루언서(이름) — 목록과 동일한 마스킹 규칙 적용 */
    const tdName = document.createElement("td");
    tdName.textContent = disp.name(row.name);
    tr.appendChild(tdName);

    const tdNick = document.createElement("td");
    tdNick.textContent = row.nickname || "-";
    tr.appendChild(tdNick);

    const tdRate = document.createElement("td");
    tdRate.className = "rate-cell" + (row.rate === null || row.rate === undefined ? " none" : "");
    tdRate.textContent = fmtRate(row.rate);
    tr.appendChild(tdRate);

    /* 금액 입력 (숫자만 · 3자리 콤마) */
    const tdInput = document.createElement("td");
    tdInput.className = "money-cell";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "money-input";
    input.inputMode = "numeric";
    input.placeholder = "0";
    input.value = row.amount === null ? "" : fmtMoney(row.amount);
    input.setAttribute("aria-label", (row.nickname || row.name) + " 해당 월 수익");
    input.addEventListener("input", () => {
      const raw = input.value.replace(/[^0-9]/g, "");
      input.value = raw ? Number(raw).toLocaleString("ko-KR") : "";
      row.amount = raw ? Number(raw) : null;
      tr.classList.toggle("row-changed", rowChanged(row));
      renderRevenueSummary();
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") saveBtn.click(); });
    tdInput.appendChild(input);
    tr.appendChild(tdInput);

    const tdTotal = document.createElement("td");
    tdTotal.className = "money-cell";
    tdTotal.textContent = fmtMoney(row.total);
    tr.appendChild(tdTotal);

    const tdSave = document.createElement("td");
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "icon-btn";
    saveBtn.textContent = "저장";
    saveBtn.addEventListener("click", async () => {
      if (row.amount === null) { showToast("금액을 입력해 주세요."); input.focus(); return; }
      setLoading(true, "저장 중…");
      try {
        await saveRevenueRow(row);
        renderRevenue();
        showToast((row.nickname || row.name) + " 님의 수익이 저장되었습니다.");
      } catch (err) {
        showToast(err.message);
      } finally {
        setLoading(false);
      }
    });
    tdSave.appendChild(saveBtn);
    tr.appendChild(tdSave);

    tbody.appendChild(tr);
  });

  renderRevenueSummary();
}

/* 1건 저장 — 누적 총수익은 변경분만큼 로컬에서 보정 */
async function saveRevenueRow(row) {
  const ym = $("#revYm").value || currentYm();
  const amount = Number(row.amount || 0);
  const res = await api("revenueUpsert", { memberId: row.id, ym, amount });
  /* 신규 생성이면 서버가 새 수익번호(순번 문자열)를 돌려준다 — 목록 컬럼에 즉시 반영 */
  if (res && res.id) row.revId = String(res.id);
  const prev = row.saved === null ? 0 : Number(row.saved);
  row.total = Number(row.total || 0) - prev + amount;
  row.saved = amount;
  row.amount = amount;
  [allMembers, records].forEach((arr) => {
    const rec = arr.find((m) => m.id === row.id);
    if (rec) rec.totalRevenue = row.total;
  });
}

function renderRevenueSummary() {
  let sum = 0, filled = 0;
  revRows.forEach((r) => {
    if (r.amount !== null) { sum += Number(r.amount); filled++; }
  });
  $("#revSumAmount").innerHTML = fmtMoney(sum) + "<small>원</small>";
  $("#revSumFilled").innerHTML = filled + "<small>명</small>";
  $("#revSumEmpty").innerHTML = (revRows.length - filled) + "<small>명</small>";
  updateRevSaveAllButton();
}

/* 변경분 일괄 저장 (순차 호출 + 진행률 표시) */
$("#btnRevSaveAll").addEventListener("click", async () => {
  const targets = revChangedRows();
  if (!targets.length) { showToast("변경된 내용이 없습니다."); return; }

  const progress = $("#revProgress");
  let done = 0, failed = 0;
  setLoading(true, "변경분을 저장하는 중…");
  progress.textContent = "0 / " + targets.length;
  try {
    for (const row of targets) {
      try { await saveRevenueRow(row); } catch (e) { failed++; }
      done++;
      progress.textContent = done + " / " + targets.length;
      setLoading(true, "변경분을 저장하는 중… (" + done + "/" + targets.length + ")");
    }
    renderRevenue();
    showToast(failed
      ? (done - failed) + "건 저장 완료, " + failed + "건 실패했습니다."
      : done + "건의 수익 내역을 저장했습니다.");
  } finally {
    setLoading(false);
    updateRevSaveAllButton();
    setTimeout(() => { progress.textContent = ""; }, 2500);
  }
});

/* =========================================================
 * 인플루언서 초대 (초대 등록 → DM 문구 복사 → DM 창 열기)
 * ========================================================= */
async function loadInvites() {
  try {
    const result = await api("inviteList", {});
    invites = result.invites || [];
    applyInviteFilter();
    renderInviteDashboard();
  } catch (err) {
    showToast(err.message);
  }
}

function applyInviteFilter() {
  const q = $("#inviteSearch").value.trim().toLowerCase().replace(/^@/, "");
  invitesView = q ? invites.filter((r) => r.insta.toLowerCase().includes(q)) : [...invites];
  paging.inv.page = 1;
  renderInvites();
}
$("#inviteSearch").addEventListener("input", () => applyInviteFilter());

function renderInviteDashboard() {
  const joined = invites.filter((r) => r.joined).length;
  $("#tileInvTotal").innerHTML = invites.length + "<small>명</small>";
  $("#tileInvJoined").innerHTML = joined + "<small>명</small>";
  $("#tileInvRate").innerHTML = (invites.length ? Math.round((joined / invites.length) * 100) : 0) + "<small>%</small>";
  $("#navInvCnt").textContent = invites.length;
}

/* DM 문구(현재 입력값)를 클립보드에 복사하고 대상과의 DM 창을 새 탭으로 연다 */
function openDmWindow(handle) {
  navigator.clipboard && navigator.clipboard.writeText(currentMessage()).catch(() => {});
  window.open("https://ig.me/m/" + encodeURIComponent(handle), "_blank", "noopener");
}

/* 발송 안내 문구를 현재 발송 계정 기준으로 갱신
   [보안] 입력값(발송 계정)은 innerHTML 로 넣지 않고 textContent 로만 조립한다. */
function updateDmGuide() {
  const el = $("#dmGuide");
  if (!el) return;
  const sender = currentSender();
  el.textContent = "";
  const b1 = document.createElement("b");
  b1.textContent = "발송 계정: @" + sender;
  const b2 = document.createElement("b");
  b2.textContent = "발송 계정(@" + sender + ")으로 로그인된 상태";
  const b3 = document.createElement("b");
  b3.textContent = "붙여넣기(Ctrl+V) 후 전송";
  el.appendChild(b1);
  el.appendChild(document.createTextNode(
    " · [초대하기] 클릭 시 ① 초대 내역에 기록 → ② 위 발송 메시지가 클립보드에 복사 → " +
    "③ 대상 계정과의 인스타그램 DM 창이 새 탭으로 열립니다. "));
  el.appendChild(b2);
  el.appendChild(document.createTextNode("에서 DM 창에 "));
  el.appendChild(b3);
  el.appendChild(document.createTextNode("하면 완료돼요."));
}

function renderInvites() {
  const tbody = $("#inviteBody");
  tbody.innerHTML = "";
  $("#statInvTotal").innerHTML = "총 초대 <b>" + invites.length + "</b>명";
  $("#inviteEmpty").style.display = invitesView.length ? "none" : "";

  const { rows, start, totalPages } = pageSlice(invitesView, paging.inv);
  $("#invPageInfo").textContent = invitesView.length
    ? (start + 1) + "–" + (start + rows.length) + " / " + invitesView.length + "건 · " + paging.inv.page + "/" + totalPages + " 페이지"
    : "0건";
  $("#invPrev").disabled = paging.inv.page <= 1;
  $("#invNext").disabled = paging.inv.page >= totalPages;

  rows.forEach((r, i) => {
    const gi = start + i;
    const tr = document.createElement("tr");

    const tdNo = document.createElement("td");
    tdNo.className = "no";
    tdNo.textContent = invitesView.length - gi;
    tr.appendChild(tdNo);

    /* 초대번호 (v2.1 : UUID → 순번 문자열). 서버로 되돌려 보낼 때는 받은 값을 그대로 쓴다. */
    const tdSeq = document.createElement("td");
    tdSeq.className = "no";
    tdSeq.textContent = r.id || "-";
    tr.appendChild(tdSeq);

    const tdDt = document.createElement("td");
    tdDt.className = "dt";
    tdDt.textContent = formatKST(r.invitedAt); // 년 월 일 시 분 초
    tr.appendChild(tdDt);

    /* 인스타 계정 (클릭 시 프로필 새 창) */
    const tdInsta = document.createElement("td");
    const a = document.createElement("a");
    a.href = "https://www.instagram.com/" + encodeURIComponent(r.insta);
    a.target = "_blank"; a.rel = "noopener";
    a.textContent = "@" + r.insta;
    a.style.cssText = "color:#6D5AE6;font-weight:700;text-decoration:none;";
    a.addEventListener("click", (e) => e.stopPropagation());
    tdInsta.appendChild(a);
    tr.appendChild(tdInsta);

    /* 가입여부 (신청 내역의 인스타 채널과 자동 매칭) */
    const tdJoin = document.createElement("td");
    if (r.joined) {
      tdJoin.innerHTML = '<span class="badge badge-yes">가입완료</span>';
      if (r.joinedNickname) tdJoin.title = "활동명: " + r.joinedNickname;
    } else {
      tdJoin.innerHTML = '<span class="badge badge-no">미가입</span>';
    }
    tr.appendChild(tdJoin);

    const tdMemo = document.createElement("td");
    tdMemo.className = "memo-cell";
    tdMemo.textContent = r.memo || "-";
    if (r.memo) tdMemo.title = r.memo;
    tr.appendChild(tdMemo);

    /* DM 다시 보내기 */
    const tdDm = document.createElement("td");
    const dmBtn = document.createElement("button");
    dmBtn.type = "button";
    dmBtn.className = "pg-btn";
    dmBtn.textContent = "✉️ DM";
    dmBtn.title = "현재 발송 메시지 복사 + DM 창 열기 (발송 계정: @" + currentSender() + ")";
    dmBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openDmWindow(r.insta);
      showToast("발송 메시지가 복사되었습니다. @" + currentSender() + " 계정으로 DM 창에 붙여넣어 전송하세요.");
    });
    tdDm.appendChild(dmBtn);
    tr.appendChild(tdDm);

    tr.addEventListener("click", () => openInviteDetail(r.id));
    tbody.appendChild(tr);
  });
}

/* 초대하기: ① 기록 ② DM 문구 클립보드 복사 ③ 인스타 DM 창 열기 */
$("#btnInvite").addEventListener("click", async () => {
  const handle = $("#inviteInsta").value.trim().replace(/^@/, "");
  if (!handle) { showToast("초대할 인스타그램 계정을 입력해 주세요."); $("#inviteInsta").focus(); return; }
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) { showToast("올바른 인스타그램 계정 형식이 아닙니다. (영문/숫자/밑줄/마침표)"); return; }
  if (!$("#inviteMessage").value.trim()) { showToast("발송 메시지를 입력해 주세요."); $("#inviteMessage").focus(); return; }
  setLoading(true, "초대 등록 중…");
  try {
    await api("inviteCreate", { insta: handle, memo: $("#inviteMemo").value.trim() });
    openDmWindow(handle); // 현재 발송 메시지 복사 + DM 창 열기
    showToast("초대 기록 완료! 발송 메시지가 복사되었습니다. @" + currentSender() + " 계정으로 DM 창에 붙여넣어 전송하세요.");
    /* 발송 계정·메시지는 재사용을 위해 유지, 대상 계정·메모만 초기화 */
    $("#inviteInsta").value = ""; $("#inviteMemo").value = "";
    await loadInvites();
  } catch (err) {
    showToast(err.message);
  } finally {
    setLoading(false);
  }
});
$("#inviteInsta").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btnInvite").click(); });
/* 발송 계정 변경 시 안내 문구 실시간 갱신 */
$("#inviteSender").addEventListener("input", updateDmGuide);

/* 초대 상세/수정 모달 */
function openInviteDetail(id) {
  const r = invites.find((x) => x.id === id);
  if (!r) return;
  $("#iv-id").value = r.id;
  $("#iv-insta").value = r.insta;
  $("#iv-memo").value = r.memo || "";
  $("#iv-meta").textContent = "초대일시: " + (r.invitedAt || "-") +
    (r.joined ? " · 가입완료" + (r.joinedNickname ? " (활동명: " + r.joinedNickname + ")" : "") : " · 미가입");
  openModal("#inviteModal");
}
$("#btnInvSave").addEventListener("click", async () => {
  const id = $("#iv-id").value;
  if (!id) return;
  setLoading(true, "저장 중…");
  try {
    await api("inviteUpdate", { id, insta: $("#iv-insta").value.trim().replace(/^@/, ""), memo: $("#iv-memo").value.trim() });
    closeModal("#inviteModal");
    showToast("저장되었습니다.");
    await loadInvites();
  } catch (err) { showToast(err.message); } finally { setLoading(false); }
});
$("#btnInvDelete").addEventListener("click", () => {
  pendingDelete = { type: "inv", id: $("#iv-id").value };
  $("#confirmMsg").innerHTML = "이 초대 내역을 삭제할까요?<br/>삭제 후에는 되돌릴 수 없습니다.";
  openModal("#confirmModal");
});


/* =========================================================
 * 엑셀 (SheetJS) — 공통 기반
 * ---------------------------------------------------------
 * ★ 라이브러리는 admin.html <head> 의 CDN 으로 로드됩니다.
 *   사내망 차단·오프라인 등으로 로드에 실패해도 ADMIN 의 기존 기능(로그인·마스킹·검색·
 *   페이징·CRUD·초대·수수료 일괄·비밀번호 변경)은 그대로 동작해야 하므로,
 *   엑셀 진입점은 전부 xlsxGuard() 를 통과해야만 실행되고
 *   버튼은 applyXlsxAvailability() 가 비활성화 + 안내 문구를 노출합니다.
 * ========================================================= */
function xlsxReady() {
  return typeof XLSX !== "undefined" && !!XLSX && !!XLSX.utils &&
         typeof XLSX.writeFile === "function" && typeof XLSX.read === "function";
}
const XLSX_NA_MSG = "⚠ 엑셀 모듈(SheetJS)을 불러오지 못해 엑셀 기능만 사용할 수 없습니다. " +
  "사내망·오프라인 환경에서는 CDN 접속이 차단될 수 있습니다. 네트워크를 확인한 뒤 새로고침해 주세요. " +
  "(그 외 기능은 모두 정상 동작합니다.)";

function applyXlsxAvailability() {
  const ok = xlsxReady();
  $$(".excel-btn").forEach((b) => {
    b.disabled = !ok;
    if (!ok) b.title = XLSX_NA_MSG;
  });
  $$(".excel-na").forEach((el) => {
    el.textContent = ok ? "" : XLSX_NA_MSG;
    el.style.display = ok ? "none" : "block";
  });
}
function xlsxGuard() {
  if (xlsxReady()) return true;
  applyXlsxAvailability();
  showToast("엑셀 모듈을 불러오지 못해 이 기능을 사용할 수 없습니다.");
  return false;
}

/* @pure:xlcell-start */
/* [보안] 수식 인젝션 방지 —
   '=' '+' '-' '@' (및 탭·개행) 으로 시작하는 '문자열' 셀은 앞에 작은따옴표를 붙여 저장한다.
   업로드 파일에서 읽은 값을 되돌려 쓰는 경로(미리보기 → 결과 파일)에도 동일 규칙을 적용한다.
   숫자 셀은 서식이 깨지지 않도록 그대로 둔다. */
function xlCell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return isFinite(v) ? v : "";
  if (typeof v === "boolean") return v ? "Y" : "N";
  /* Date 를 String() 으로 넘기면 "Wed Jul 01 2026 … (한국 표준시)" 같은 영문 문자열이
     그대로 파일에 박힌다. (apps-script.gs toDateTime() 이 막는 것과 같은 사고)
     realm 을 타지 않는 판정으로 YYYY-MM-DD[ HH:mm:ss] 로 고정한다. */
  if (Object.prototype.toString.call(v) === "[object Date]") {
    if (isNaN(v.getTime())) return "";
    const ymd = ymdOfDate(v);
    if (!v.getHours() && !v.getMinutes() && !v.getSeconds()) return ymd;
    return ymd + " " + pad2(v.getHours()) + ":" + pad2(v.getMinutes()) + ":" + pad2(v.getSeconds());
  }
  const str = String(v);
  return /^[=+\-@\t\r\n]/.test(str) ? "'" + str : str;
}
function xlRow(arr) { return (arr || []).map(xlCell); }
/* @pure:xlcell-end */

/* 한글은 2칸으로 계산해 열 너비를 자동 산정 */
function cellWidth(v) {
  const str = String(v === null || v === undefined ? "" : v);
  let w = 0;
  for (let i = 0; i < str.length; i++) w += str.charCodeAt(i) > 127 ? 2 : 1;
  return w;
}
function autoWidths(aoa, ncol) {
  const out = [];
  for (let c = 0; c < ncol; c++) {
    let max = 8;
    for (let r = 0; r < aoa.length; r++) {
      const w = cellWidth(aoa[r] && aoa[r][c]);
      if (w > max) max = w;
    }
    out.push(Math.min(max + 2, 60));
  }
  return out;
}

/* 헤더 행 서식 — 굵게 + 배경색.
   ※ SheetJS 커뮤니티 배포본은 셀 서식 '쓰기'를 지원하지 않을 수 있다.
      지원하지 않는 배포본에서는 이 값이 조용히 무시될 뿐 파일 생성에는 영향이 없다.
      열 너비(!cols) · 행 높이(!rows) · 자동 필터(!autofilter) 는 커뮤니티 배포본에서도 반영된다. */
const XL_HEADER_STYLE = {
  font: { bold: true, sz: 11, color: { rgb: "FF1F2224" } },
  fill: { patternType: "solid", fgColor: { rgb: "FFECF0F8" }, bgColor: { rgb: "FFECF0F8" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: {
    top:    { style: "thin", color: { rgb: "FFC1C4C6" } },
    bottom: { style: "thin", color: { rgb: "FFC1C4C6" } },
    left:   { style: "thin", color: { rgb: "FFC1C4C6" } },
    right:  { style: "thin", color: { rgb: "FFC1C4C6" } }
  }
};

/* aoa → 워크시트 (열 너비 · 헤더 서식 · 틀 고정(1행) · 자동 필터) */
function makeSheet(aoa, widths) {
  const rows = (aoa || []).map(xlRow);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  let ncol = 1;
  rows.forEach((r) => { if (r.length > ncol) ncol = r.length; });

  ws["!cols"] = ((widths && widths.length) ? widths : autoWidths(rows, ncol)).map((w) => ({ wch: w }));
  ws["!rows"] = [{ hpt: 22 }];
  for (let c = 0; c < ncol; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[ref]) ws[ref].s = XL_HEADER_STYLE;
  }
  /* 틀 고정 1행 */
  ws["!freeze"] = "A2";
  ws["!panes"] = [{ ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" }];
  if (rows.length > 1) {
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: ncol - 1 } })
    };
  }
  return ws;
}

function saveWorkbook(wb, filename) {
  XLSX.writeFile(wb, filename, { bookType: "xlsx", compression: true, cellStyles: true });
}
/* LFmall_신청내역_20260804.xlsx */
function xlFileName(screen) {
  return "LFmall_" + screen + "_" + todayYmd().replace(/-/g, "") + ".xlsx";
}

/* 개인정보가 포함된 파일을 내보낸 직후 화면 상단에 고정 안내를 띄운다. */
function showPiiNotice() {
  let bar = document.getElementById("piiNotice");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "piiNotice";
    bar.setAttribute("role", "status");
    bar.style.cssText =
      "position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:320;" +
      "max-width:min(720px,92vw);padding:11px 18px;border-radius:8px;background:#FFF7E6;" +
      "border:1px solid #F5D48A;color:#8A5A00;font-size:13px;font-weight:700;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.14);";
    document.body.appendChild(bar);
  }
  bar.textContent = "🔓 개인정보가 포함된 파일입니다. 취급에 주의해 주세요.";
  bar.style.display = "";
  clearTimeout(showPiiNotice._t);
  showPiiNotice._t = setTimeout(() => { bar.style.display = "none"; }, 12000);
}

/* =========================================================
 * 구현 4 : 조회 결과 엑셀 다운로드 (4개 화면)
 *  - '현재 화면에 조회된 결과' 기준 (검색어·필터 적용 상태 그대로, 페이징과 무관하게 전체)
 *  - 마스킹 상태를 그대로 반영하며, 마스킹 해제 상태이면 다운로드 전에 확인 모달로 경고한다.
 * ========================================================= */
const EXPORTS = {
  applications: {
    label: "신청 내역", screen: "신청내역", sheet: "신청내역", pii: true,
    headers: ["신청일시", "회원ID", "활동명", "이름", "이메일", "휴대폰", "관심카테고리", "사업자",
              "대표채널", "Instagram", "YouTube", "X(Twitter)", "TikTok", "기타채널",
              "수수료율", "비밀번호설정여부", "링크수", "총수익", "회원상태", "PLAS", "메모"],
    widths: [21, 28, 18, 12, 28, 16, 22, 10, 12, 32, 32, 32, 32, 32, 10, 16, 8, 13, 10, 20, 28],
    rows: () => visibleRecords().map((r) => {
      const g = snsGroupsOf(r);
      const pt = primaryTypeOf(r);
      return [
        fmtStamp(r.submittedAt), disp.memberId(r.id, r.memberIdMasked),
        r.nickname || "", disp.name(r.name), disp.email(r.email), disp.phone(r.phone),
        r.categories || "", r.bizStatus || "",
        pt ? snsTypeLabel(pt) : "", g.instagram, g.youtube, g.x, g.tiktok, g.etc,
        (r.commissionRate === null || r.commissionRate === undefined) ? "" : Number(r.commissionRate),
        r.hasPassword ? "설정됨" : "미설정",
        Number(r.linkCount || 0), Number(r.totalRevenue || 0),
        r.memberStatus || "", r.plasInfo || "", r.memo || ""
      ];
    })
  },
  invites: {
    label: "초대 내역", screen: "초대내역", sheet: "초대내역", pii: false,
    headers: ["초대번호", "초대일시", "인스타계정", "가입여부", "가입활동명", "메모"],
    widths: [10, 26, 22, 10, 18, 32],
    rows: () => invitesView.map((r) => [
      r.id || "", formatKST(r.invitedAt), r.insta || "",
      r.joined ? "가입완료" : "미가입", r.joinedNickname || "", r.memo || ""
    ])
  },
  links: {
    label: "링크 관리", screen: "링크관리", sheet: "링크관리", pii: true,
    headers: ["링크번호", "인플루언서", "회원ID", "링크명", "URL", "등록일", "유효시작일", "유효종료일", "상태", "메모"],
    widths: [10, 26, 28, 30, 48, 13, 13, 13, 8, 32],
    rows: () => links.map((l) => [
      l.id || "", memberLabel(l.memberId, l.memberName, l.memberIdMasked),
      disp.memberId(l.memberId, l.memberIdMasked), l.name || "", l.url || "",
      l.issuedAt || "", l.startAt || "", l.endAt || "(무기한)",
      linkStatusOf(l.status).label, l.memo || ""
    ])
  },
  revenue: {
    label: "수익 관리", screen: "수익관리", sheet: "수익관리", pii: true,
    headers: ["수익번호", "인플루언서", "활동명", "회원ID", "연월", "수익금액", "수수료율", "누적총수익"],
    widths: [10, 16, 22, 28, 11, 14, 10, 14],
    rows: () => {
      const ym = $("#revYm").value || currentYm();
      return revRows.map((r) => [
        r.revId || "", disp.name(r.name), r.nickname || "", disp.memberId(r.id, r.idMasked), ym,
        r.amount === null ? "" : Number(r.amount),
        (r.rate === null || r.rate === undefined) ? "" : Number(r.rate),
        Number(r.total || 0)
      ]);
    }
  }
};

/* 개인정보 확인 모달 대기 중인 '작업'. 화면 키가 아니라 실행 함수를 담는다
   (조회결과 다운로드 / 양식 다운로드가 같은 모달을 쓰기 때문). */
let pendingDownload = null;

/**
 * 개인정보가 포함된 파일을 내보내기 전 반드시 한 번 확인받는다.
 * @param {String} msg    무엇을 몇 건 내려받는지
 * @param {String} detail 어떤 개인정보가 왜 포함되는지
 * @param {Function} run  확인 시 실행할 작업
 */
function confirmPii(msg, detail, run) {
  pendingDownload = run;
  $("#exportWarnMsg").textContent = msg;
  $("#exportWarnDetail").textContent = detail;
  openModal("#exportWarnModal");
}

function exportView(key) {
  if (!xlsxGuard()) return;
  if (!hasKey(EXPORTS, key)) return;
  const def = EXPORTS[key];
  const rows = def.rows();
  if (!rows.length) { showToast("내려받을 데이터가 없습니다. 먼저 조회해 주세요."); return; }

  /* 마스킹 해제 상태에서 개인정보 포함 화면을 내려받으면 반드시 한 번 확인받는다 */
  if (def.pii && !masked) {
    confirmPii(
      "[" + def.label + "] 현재 조회된 " + rows.length + "건을 엑셀 파일로 내려받습니다.",
      "현재 마스킹이 해제된 상태입니다. 내려받는 파일에는 이름·이메일·휴대폰번호와 " +
      "회원ID(=이메일) 원본이 그대로 포함됩니다. " +
      "업무 목적 외 보관·전달을 금지하며, 사용 후에는 즉시 파기해 주세요.",
      function () { doExport(key); });
    return;
  }
  doExport(key);
}

function doExport(key) {
  if (!xlsxGuard() || !hasKey(EXPORTS, key)) return;
  const def = EXPORTS[key];
  const rows = def.rows();
  if (!rows.length) { showToast("내려받을 데이터가 없습니다."); return; }
  try {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, makeSheet([def.headers].concat(rows), def.widths), def.sheet);
    saveWorkbook(wb, xlFileName(def.screen));
    showToast("[" + def.label + "] " + rows.length + "건을 엑셀로 내려받았습니다.");
    if (def.pii && !masked) showPiiNotice();
  } catch (e) {
    showToast("엑셀 파일을 만들지 못했습니다. " + ((e && e.message) || ""));
  }
}

$("#btnExcelApps").addEventListener("click", () => exportView("applications"));
$("#btnExcelInvites").addEventListener("click", () => exportView("invites"));
$("#btnExcelLinks").addEventListener("click", () => exportView("links"));
$("#btnExcelRevenue").addEventListener("click", () => exportView("revenue"));
$("#btnExportConfirm").addEventListener("click", () => {
  const run = pendingDownload;
  pendingDownload = null;
  closeModal("#exportWarnModal");
  if (typeof run === "function") run();
});

/* =========================================================
 * 구현 2·3 : 양식 다운로드
 * ========================================================= */
/* 시트3 '인플루언서목록' — 업로드 시 인플루언서를 식별하는 키만 담는다.
   [개인정보 최소화]
     · 이메일 : 업로드 식별키이므로 원본이 필요하다. → 대신 다운로드 전에 반드시 확인받는다.
     · 이름   : 식별에 쓰이지 않는다. 화면과 동일하게 현재 마스킹 규칙(disp.name)을 따른다.
     · 휴대폰 : 업로드 파서(resolveMember)가 전혀 쓰지 않는다. → 아예 넣지 않는다. */
function memberListSheetAoa() {
  const aoa = [["활동명", "이름", "이메일", "수수료율(%)"]];
  memberPool().forEach((r) => {
    aoa.push([
      r.nickname || "", disp.name(r.name), r.email || "",
      (r.commissionRate === null || r.commissionRate === undefined) ? "" : Number(r.commissionRate)
    ]);
  });
  if (aoa.length === 1) aoa.push(["(등록된 인플루언서가 없습니다)", "", "", ""]);
  return aoa;
}

const XL_IDENT_GUIDE = [
  ["활동명", "△", "ADMIN 에 등록된 활동명과 정확히 일치해야 합니다. 이메일을 적었다면 비워도 됩니다."],
  ["이메일", "△", "ADMIN 에 등록된 이메일. ★ 활동명 또는 이메일 중 하나로 인플루언서를 식별합니다."],
  ["", "", "둘 다 적으면 이메일을 우선 사용합니다. 둘 다 비어 있으면 오류 행으로 표시됩니다."],
  ["", "", "같은 활동명이 2명 이상이면 식별할 수 없으므로 이메일로 구분해 주세요."],
  ["", "", "[인플루언서목록] 시트의 값을 그대로 복사해 붙여넣는 것을 권장합니다."]
];
const XL_COMMON_GUIDE = [
  ["", "", ""],
  ["※ 작성 요령", "", "1행의 헤더는 지우거나 바꾸지 마세요. (열 순서는 달라도 헤더 이름으로 찾습니다)"],
  ["", "", "(예시) 가 포함된 행은 업로드 시 자동으로 제외되지만, 지운 뒤 올리는 것을 권장합니다."],
  ["", "", "빈 행은 자동으로 건너뜁니다."],
  ["", "", "업로드는 1건씩 순차 등록됩니다. 서버 왕복에 건당 2~4초가 걸려 100건이면 3~7분 정도 걸립니다."],
  ["", "", "진행 중 [중단] 버튼으로 언제든 멈출 수 있으며, 이미 등록된 건은 유지됩니다."],
  ["※ 범례", "●", "필수 항목"],
  ["", "△", "활동명 · 이메일 중 하나는 필수"]
];

async function ensureMembersForExcel() {
  setLoading(true, "인플루언서 목록을 불러오는 중…");
  try { await ensureMembers(); }
  catch (e) { showToast("인플루언서 목록을 불러오지 못했습니다. " + e.message); }
  finally { setLoading(false); }
}

/* [v2.2] 이메일 = 회원ID(업로드 식별키) 이므로 양식에는 원본을 담을 수밖에 없다.
   대신 마스킹 상태와 무관하게 confirmPii 를 반드시 거치며, 마스킹 ON 일 때는
   '마스킹 중인데도 원본이 들어간다' 는 사실을 문구로 분명히 알린다. (SPEC §4-0) */
function xlTemplatePiiDetail() {
  return (masked
      ? "⚠️ 현재 개인정보 마스킹이 켜져 있지만, 이 양식만은 예외입니다. "
      : "") +
    "양식의 [인플루언서목록] 시트에는 업로드 시 인플루언서를 식별하는 키인 " +
    "'이메일 원본(=회원ID)' 이 포함됩니다. (이름은 현재 마스킹 규칙을 따르며, 휴대폰번호는 포함되지 않습니다.) " +
    "업무 목적 외 보관·전달을 금지하며, 사용 후에는 즉시 파기해 주세요.";
}

/* 양식은 [인플루언서목록] 시트에 이메일 원본을 담으므로 마스킹 상태와 무관하게 항상 확인받는다.
   담을 개인정보가 하나도 없으면(등록 0명) 물을 이유가 없으므로 바로 만든다. */
async function downloadLinkTemplate() {
  if (!xlsxGuard()) return;
  await ensureMembersForExcel();
  if (!memberPool().length) { buildLinkTemplate(); return; }
  confirmPii(
    "[링크 대량등록 양식] 인플루언서 " + memberPool().length + "명의 목록 시트가 함께 포함됩니다.",
    xlTemplatePiiDetail(), buildLinkTemplate);
}

function buildLinkTemplate() {
  if (!xlsxGuard()) return;
  const rows = [
    ["활동명", "이메일", "링크명", "링크URL", "유효시작일", "유효종료일", "메모"],
    ["데일리버니 (예시)", "daily.bunny@example.com", "2026 F/W 아우터 기획전 (예시)",
     "https://slink.im/4z37UeG", "2026-08-01", "2026-09-30", "(예시) 가을 신상 기획전"],
    ["스타일킴 (예시)", "style.kim@example.com", "여름 클리어런스 (예시)",
     "https://slink.im/9aB2xQt", "2026-08-05", "", "(예시) 유효종료일을 비우면 무기한"]
  ];
  const guide = [["항목", "필수", "작성 방법"]]
    .concat(XL_IDENT_GUIDE)
    .concat([
      ["링크명", "", "예: 2026 F/W 아우터 기획전. 비워도 등록되지만 관리상 입력을 권장합니다."],
      ["링크URL", "●", "반드시 http:// 또는 https:// 로 시작해야 합니다."],
      ["유효시작일", "", "YYYY-MM-DD (예: 2026-08-01). 비우면 등록일(오늘)로 저장됩니다."],
      ["유효종료일", "", "YYYY-MM-DD. ★ 비워 두면 무기한 활성 링크입니다."],
      ["", "", "유효종료일이 유효시작일보다 빠르면 오류 행으로 표시됩니다."],
      ["메모", "", "내부 관리용 메모입니다. 인플루언서 화면에는 노출되지 않습니다."]
    ])
    .concat(XL_COMMON_GUIDE);
  try {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, makeSheet(rows, [20, 28, 32, 46, 14, 14, 32]), "링크등록");
    XLSX.utils.book_append_sheet(wb, makeSheet(guide, [16, 8, 88]), "작성안내");
    XLSX.utils.book_append_sheet(wb, makeSheet(memberListSheetAoa(), [20, 13, 30, 13]), "인플루언서목록");
    saveWorkbook(wb, "링크_대량등록_양식.xlsx");
    showToast("링크 대량등록 양식을 내려받았습니다. [인플루언서목록] 시트의 활동명·이메일을 복사해 쓰세요.");
    showPiiNotice();   /* 인플루언서목록 시트에 실제 이메일이 포함된다 */
  } catch (e) {
    showToast("양식 파일을 만들지 못했습니다. " + ((e && e.message) || ""));
  }
}

async function downloadRevenueTemplate() {
  if (!xlsxGuard()) return;
  await ensureMembersForExcel();
  if (!memberPool().length) { buildRevenueTemplate(); return; }
  confirmPii(
    "[월별수익 대량등록 양식] 인플루언서 " + memberPool().length + "명의 목록 시트가 함께 포함됩니다.",
    xlTemplatePiiDetail(), buildRevenueTemplate);
}

function buildRevenueTemplate() {
  if (!xlsxGuard()) return;
  const ym = $("#revYm").value || currentYm();
  const rows = [
    ["활동명", "이메일", "연월(YYYY-MM)", "수익금액"],
    ["데일리버니 (예시)", "daily.bunny@example.com", ym, 612400],
    ["스타일킴 (예시)", "style.kim@example.com", ym, 0]
  ];
  const guide = [["항목", "필수", "작성 방법"]]
    .concat(XL_IDENT_GUIDE)
    .concat([
      ["연월(YYYY-MM)", "●", "예: 2026-08. 셀 서식이 '날짜' 여도 인식하며 202608 형식도 허용합니다."],
      ["수익금액", "●", "원 단위 정수. 0 이상이어야 하며 소수점은 허용하지 않습니다."],
      ["", "", "1,000 처럼 콤마가 들어가도 인식합니다. 0 을 입력하면 0 원으로 저장됩니다."],
      ["", "", "★ (인플루언서, 연월) 조합이 이미 있으면 기존 값을 덮어씁니다. (upsert)"],
      ["", "", "★ 같은 (인플루언서, 연월) 조합이 파일 안에 두 번 이상 있으면 업로드 전에 경고하며,"],
      ["", "", "   기본적으로 '마지막 행의 값'만 등록합니다."]
    ])
    .concat(XL_COMMON_GUIDE);
  try {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, makeSheet(rows, [20, 28, 16, 14]), "수익등록");
    XLSX.utils.book_append_sheet(wb, makeSheet(guide, [16, 8, 88]), "작성안내");
    XLSX.utils.book_append_sheet(wb, makeSheet(memberListSheetAoa(), [20, 13, 30, 13]), "인플루언서목록");
    saveWorkbook(wb, "월별수익_대량등록_양식.xlsx");
    showToast("월별수익 대량등록 양식을 내려받았습니다. [인플루언서목록] 시트의 활동명·이메일을 복사해 쓰세요.");
    showPiiNotice();
  } catch (e) {
    showToast("양식 파일을 만들지 못했습니다. " + ((e && e.message) || ""));
  }
}

$("#btnLinkTemplate").addEventListener("click", downloadLinkTemplate);
$("#btnRevTemplate").addEventListener("click", downloadRevenueTemplate);

/* =========================================================
 * 구현 2·3 : 엑셀 대량 업로드 — 파싱 / 검증 (순수 함수)
 * ---------------------------------------------------------
 * 아래 함수들은 DOM·네트워크에 의존하지 않으므로 Node 에서 단독 검증할 수 있습니다.
 * (공용_서버_문서/_테스트하네스 와 동일한 원칙 — 화면 로직과 규칙을 분리)
 * ========================================================= */

/* @pure:xlparse-start */
/* 헤더 비교용 정규화 : 공백 제거 + 괄호 주석 제거 + 소문자 */
function normHeader(v) {
  return String(v == null ? "" : v).replace(/\(.*?\)/g, "").replace(/\s+/g, "").toLowerCase();
}
const XL_ALIASES = {
  nickname: ["활동명", "닉네임", "인플루언서", "인플루언서명"],
  email:    ["이메일", "email", "메일", "이메일주소"],
  name:     ["링크명", "링크이름", "링크 명"],
  url:      ["링크URL", "URL", "링크주소", "주소"],
  start:    ["유효시작일", "시작일", "시작"],
  end:      ["유효종료일", "종료일", "종료"],
  memo:     ["메모", "비고"],
  ym:       ["연월", "정산연월", "년월", "정산월"],
  amount:   ["수익금액", "금액", "수익"]
};

/* 헤더 행 → { key: 열인덱스 } */
function matchHeaders(row, keys) {
  const map = {};
  (row || []).forEach((cell, c) => {
    const h = normHeader(cell);
    if (!h) return;
    keys.forEach((k) => {
      if (map[k] !== undefined) return;
      const aliases = hasKey(XL_ALIASES, k) ? XL_ALIASES[k] : [];
      if (aliases.some((a) => normHeader(a) === h)) map[k] = c;
    });
  });
  return map;
}

/* 시트 AOA → [{excelRow, data}] (상위 5행 중 헤더를 자동 탐색) */
function mapSheetRows(aoa, keys) {
  let headerRow = -1, best = 0, map = null;
  const limit = Math.min((aoa || []).length, 5);
  for (let i = 0; i < limit; i++) {
    const m = matchHeaders(aoa[i], keys);
    const hit = Object.keys(m).length;
    if (hit > best) { best = hit; headerRow = i; map = m; }
  }
  if (headerRow === -1 || !map || best < 2) return { headerRow: -1, rows: [] };
  const rows = [];
  for (let r = headerRow + 1; r < aoa.length; r++) {
    const raw = aoa[r] || [];
    const obj = {};
    let empty = true;
    keys.forEach((k) => {
      const c = map[k];
      const v = (c === undefined) ? "" : raw[c];
      obj[k] = (v === null || v === undefined) ? "" : v;
      if (String(obj[k]).trim() !== "") empty = false;
    });
    if (empty) continue;
    rows.push({ excelRow: r + 1, data: obj });
  }
  return { headerRow, rows };
}

function pad2(n) { return String(n).padStart(2, "0"); }
function ymdOfDate(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
/* 엑셀 일련번호(1900 날짜 체계) → Date. SheetJS cellDates:true 로 읽으면 보통 호출되지 않는다. */
function excelSerialToDate(n) {
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
/* 날짜 직렬값의 하한. 20000 = 1954-10-03.
   사용자가 날짜 칸에 0 이나 5 같은 값을 적으면 직렬값으로 해석되어 1899-12-30 / 1900-01-05 가
   조용히 등록된다. 업무 데이터에 1954년 이전 날짜는 없으므로 그 아래는 '형식 오류'로 돌린다. */
const XL_MIN_SERIAL = 20000;
/* Date 판정은 realm 을 타지 않는 방식으로 한다. (apps-script.gs toYmd() 와 동일 규칙)
   SheetJS 가 워커·iframe 등 다른 realm 에서 만든 Date 는 instanceof 로 걸러지지 않는다. */
function isDateCell(v) { return Object.prototype.toString.call(v) === "[object Date]"; }

/* 날짜 셀 → 'YYYY-MM-DD' | '' (빈 값) | null (형식 오류) */
function xlYmd(v) {
  if (v === null || v === undefined) return "";
  if (isDateCell(v)) return isNaN(v.getTime()) ? null : ymdOfDate(v);
  if (typeof v === "number") {
    if (!isFinite(v) || v < XL_MIN_SERIAL) return null;
    return ymdOfDate(excelSerialToDate(v));
  }
  const str = String(v).trim();
  if (!str) return "";
  let m = str.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return m[1] + "-" + pad2(m[2]) + "-" + pad2(m[3]);
  m = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : ymdOfDate(d);
}

/* 연월 셀 → 'YYYY-MM' | '' | null */
function xlYm(v) {
  if (v === null || v === undefined) return "";
  if (isDateCell(v)) return isNaN(v.getTime()) ? null : (v.getFullYear() + "-" + pad2(v.getMonth() + 1));
  if (typeof v === "number") {
    if (!isFinite(v)) return null;
    const n = Math.round(v);
    if (n >= 190001 && n <= 999912) {          /* 202607 처럼 적은 경우 */
      const str = String(n);
      return str.slice(0, 4) + "-" + str.slice(4, 6);
    }
    if (v < XL_MIN_SERIAL) return null;        /* 0·5 같은 값이 1899-12 로 둔갑하지 않게 */
    const d = excelSerialToDate(v);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
  }
  const str = String(v).trim();
  if (!str) return "";
  let m = str.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return m[1] + "-" + pad2(m[2]);
  m = str.match(/^(\d{4})[-./](\d{1,2})$/);
  if (m) return m[1] + "-" + pad2(m[2]);
  m = str.match(/^(\d{4})(\d{2})$/);
  if (m) return m[1] + "-" + m[2];
  m = str.match(/^(\d{4})년\s*(\d{1,2})월/);
  if (m) return m[1] + "-" + pad2(m[2]);
  return null;
}

/* 금액 셀 → Number | null (빈 값·형식 오류) */
function xlAmount(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const str = String(v).trim().replace(/[,\s원]/g, "");
  if (!str) return null;
  return /^-?\d+(\.\d+)?$/.test(str) ? Number(str) : null;
}

/* 활동명 / 이메일 → 회원 레코드. 실패 사유를 함께 돌려준다. */
function resolveMember(pool, nicknameRaw, emailRaw) {
  const list = pool || [];
  const email = String(emailRaw == null ? "" : emailRaw).trim().toLowerCase();
  const nickname = String(nicknameRaw == null ? "" : nicknameRaw).trim();
  if (email) {
    const hits = list.filter((r) => String(r.email || "").trim().toLowerCase() === email);
    if (hits.length === 1) return { member: hits[0] };
    /* [v2.2] 이메일 = 회원ID(개인정보). 사유 문구도 화면에 그대로 찍히므로 마스킹 규칙을 따른다.
       (어느 행인지는 '엑셀 행' 번호와 이메일 컬럼으로 이미 특정할 수 있다) */
    const shown = disp.email(email);
    if (hits.length > 1) return { error: "이메일이 중복 등록되어 있습니다: " + shown };
    return { error: "이메일로 인플루언서를 찾을 수 없습니다: " + shown };
  }
  if (nickname) {
    const lower = nickname.toLowerCase();
    let hits = list.filter((r) => String(r.nickname || "").trim() === nickname);
    if (!hits.length) hits = list.filter((r) => String(r.nickname || "").trim().toLowerCase() === lower);
    if (hits.length === 1) return { member: hits[0] };
    if (hits.length > 1) return { error: "같은 활동명이 " + hits.length + "명 있습니다. 이메일로 구분해 주세요: " + nickname };
    return { error: "활동명으로 인플루언서를 찾을 수 없습니다: " + nickname };
  }
  return { error: "활동명 또는 이메일 중 하나는 반드시 입력해야 합니다." };
}

/* [순수 함수] 링크 업로드 1행 검증 */
function validateLinkRow(data, pool, today) {
  const reasons = [];
  const found = resolveMember(pool, data.nickname, data.email);
  if (found.error) reasons.push(found.error);

  const url = String(data.url == null ? "" : data.url).trim();
  if (!url) reasons.push("링크URL이 비어 있습니다.");
  else if (!/^https?:\/\//i.test(url)) reasons.push("링크URL은 http:// 또는 https:// 로 시작해야 합니다.");

  const startAt = xlYmd(data.start);
  const endAt = xlYmd(data.end);
  if (startAt === null) reasons.push("유효시작일 형식이 올바르지 않습니다. (YYYY-MM-DD)");
  if (endAt === null) reasons.push("유효종료일 형식이 올바르지 않습니다. (YYYY-MM-DD)");
  if (startAt && endAt && endAt < startAt) reasons.push("유효종료일이 유효시작일보다 빠릅니다.");

  return {
    ok: reasons.length === 0,
    reason: reasons.join(" / "),
    member: found.member || null,
    payload: {
      memberId: found.member ? found.member.id : "",
      name: String(data.name == null ? "" : data.name).trim(),
      url,
      startAt: startAt || String(today || ""),
      endAt: endAt || "",
      memo: String(data.memo == null ? "" : data.memo).trim()
    }
  };
}

/* [순수 함수] 수익 업로드 1행 검증 */
function validateRevenueRow(data, pool) {
  const reasons = [];
  const found = resolveMember(pool, data.nickname, data.email);
  if (found.error) reasons.push(found.error);

  const ymRaw = String(data.ym == null ? "" : data.ym).trim();
  const ym = xlYm(data.ym);
  if (!ymRaw) reasons.push("연월이 비어 있습니다. (YYYY-MM)");
  else if (ym === null || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) reasons.push("연월 형식이 올바르지 않습니다. (YYYY-MM)");

  const amount = xlAmount(data.amount);
  if (amount === null) reasons.push("수익금액이 비어 있거나 숫자가 아닙니다.");
  else if (amount < 0) reasons.push("수익금액은 0 이상이어야 합니다.");
  else if (Math.floor(amount) !== amount) reasons.push("수익금액은 원 단위 정수로 입력해 주세요.");

  return {
    ok: reasons.length === 0,
    reason: reasons.join(" / "),
    member: found.member || null,
    payload: {
      memberId: found.member ? found.member.id : "",
      ym: (ym === null ? "" : ym),
      amount: (amount === null ? 0 : Math.round(amount))
    }
  };
}

/* [순수 함수] 파일 안의 (인플루언서, 연월) 중복 탐지 → 마지막 행만 남길 인덱스 집합 */
function findRevenueDuplicates(rows) {
  const byKey = {};
  (rows || []).forEach((row, i) => {
    if (!row || !row.ok) return;
    const key = row.payload.memberId + "|" + row.payload.ym;
    if (!hasKey(byKey, key)) byKey[key] = [];
    byKey[key].push(i);
  });
  const groups = [];
  const keepLast = new Set();
  Object.keys(byKey).forEach((k) => {
    const idx = byKey[k];
    keepLast.add(idx[idx.length - 1]);
    if (idx.length > 1) groups.push({ key: k, indexes: idx });
  });
  return { groups, keepLast };
}

/* (예시) 가 남아 있는 안내용 행은 업로드 대상에서 자동 제외한다. */
function isSampleRow(data) {
  return Object.keys(data || {}).some((k) => String(data[k] == null ? "" : data[k]).indexOf("(예시)") !== -1);
}
/* @pure:xlparse-end */

/* =========================================================
 * 엑셀 대량 업로드 — 화면 흐름 (파일 선택 → 미리보기·검증 → 실행 → 결과)
 * ========================================================= */
/* 업로드 미리보기·로그의 회원 표기 — 화면이므로 마스킹 규칙을 그대로 따른다.
   (payload.memberId 는 서버로 보내는 원본 값이며 화면에 직접 찍지 않는다) */
function xlEmailCell(v) {
  const raw = String(v == null ? "" : v).trim();
  return raw ? disp.email(raw) : "";
}
function xlRowMemberLabel(row) {
  if (!row || !row.member) return "(미식별)";
  const m = row.member;
  return m.nickname || disp.name(m.name) || disp.memberId(m.id, m.memberIdMasked);
}

const XL_MODES = {
  link: {
    title: "🔗 링크 엑셀 대량 업로드",
    action: "linkCreate",
    keys: ["nickname", "email", "name", "url", "start", "end", "memo"],
    columns: ["활동명", "이메일", "링크명", "링크URL", "유효시작일", "유효종료일", "메모"],
    intro: "[📄 양식 다운로드] 로 받은 '링크등록' 시트에 맞춰 작성한 파일을 선택하세요. " +
           "활동명 또는 이메일로 인플루언서를 식별하며, 각 행은 linkCreate 로 1건씩 등록됩니다.",
    validate: (data, pool) => validateLinkRow(data, pool, todayYmd()),
    cells: (row) => [
      row.data.nickname, xlEmailCell(row.data.email), row.payload.name, row.payload.url,
      row.payload.startAt, row.payload.endAt || "(무기한)", row.payload.memo
    ],
    rowLabel: (row) => xlRowMemberLabel(row) + " · " + (row.payload.name || row.payload.url),
    after: async () => { await loadLinks(); await loadList(); }
  },
  revenue: {
    title: "💰 월별 수익 엑셀 대량 업로드",
    action: "revenueUpsert",
    keys: ["nickname", "email", "ym", "amount"],
    columns: ["활동명", "이메일", "연월", "수익금액"],
    intro: "[📄 양식 다운로드] 로 받은 '수익등록' 시트에 맞춰 작성한 파일을 선택하세요. " +
           "각 행은 revenueUpsert 로 등록되며, 같은 (인플루언서, 연월) 이 이미 있으면 값을 갱신합니다.",
    validate: (data, pool) => validateRevenueRow(data, pool),
    cells: (row) => [row.data.nickname, xlEmailCell(row.data.email), row.payload.ym, fmtMoney(row.payload.amount)],
    rowLabel: (row) => xlRowMemberLabel(row) + " · " + row.payload.ym,
    after: async () => { await loadRevenue(); await loadList(); }
  }
};

const xlState = { mode: null, rows: [], running: false, aborted: false, fileName: "" };
let xlDupCheckbox = null;   /* 동적 생성 — HTML 에 id 를 두지 않는다 */
let xlErrCheckbox = null;

function xlMode() { return hasKey(XL_MODES, String(xlState.mode)) ? XL_MODES[xlState.mode] : null; }

function showXlStep(n) {
  $("#xlStep1").style.display = n === 1 ? "" : "none";
  $("#xlStep2").style.display = n === 2 ? "" : "none";
  $("#xlStep3").style.display = n === 3 ? "" : "none";
  $("#btnXlRun").style.display = n === 2 ? "" : "none";
  $("#btnXlBack").style.display = n === 2 ? "" : "none";
  $("#btnXlAbort").style.display = (n === 3 && xlState.running) ? "" : "none";
}

async function openExcelUpload(mode) {
  if (!xlsxGuard()) return;
  if (!hasKey(XL_MODES, mode)) return;
  await ensureMembersForExcel();
  if (!memberPool().length) { showToast("등록된 인플루언서가 없습니다. 먼저 신청 내역을 등록해 주세요."); return; }

  xlState.mode = mode;
  xlState.rows = [];
  xlState.running = false;
  xlState.aborted = false;
  xlState.fileName = "";
  xlDupCheckbox = null;
  xlErrCheckbox = null;

  const def = XL_MODES[mode];
  $("#xlTitle").textContent = def.title;
  $("#xlIntro").textContent = def.intro;
  $("#xlSpeedNote").textContent =
    "⏱ 서버(Apps Script) 왕복에 건당 2~4초가 걸립니다. 100건이면 3~7분 정도 소요됩니다. " +
    "진행 중 [중단] 버튼으로 언제든 멈출 수 있으며, 이미 등록된 건은 그대로 유지됩니다. " +
    "업로드가 끝날 때까지 창을 닫거나 새로고침하지 마세요.";
  $("#xlFile").value = "";
  $("#xlDupWarn").style.display = "none";
  $("#xlErrWarn").style.display = "none";
  $("#btnXlClose").disabled = false;
  showXlStep(1);
  openModal("#excelModal");
}
$("#btnLinkUpload").addEventListener("click", () => openExcelUpload("link"));
$("#btnRevUpload").addEventListener("click", () => openExcelUpload("revenue"));

$("#xlFile").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!xlsxGuard()) return;
  const def = xlMode();
  if (!def) return;
  setLoading(true, "엑셀 파일을 읽는 중…");
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
    const first = wb.SheetNames && wb.SheetNames[0];
    if (!first) throw new Error("시트를 찾을 수 없습니다.");
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[first], { header: 1, defval: "", blankrows: false, raw: true });
    /* [보안] 파일명·셀 값은 신뢰하지 않는다 — 화면 표기는 전부 textContent 로만 한다 */
    xlState.fileName = String(file.name || "");
    buildXlPreview(aoa);
  } catch (err) {
    showToast("엑셀 파일을 읽지 못했습니다. " + ((err && err.message) || ""));
  } finally {
    setLoading(false);
  }
});

function buildXlPreview(aoa) {
  const def = xlMode();
  if (!def) return;
  const pool = memberPool();
  const mapped = mapSheetRows(aoa, def.keys);
  if (mapped.headerRow === -1 || !mapped.rows.length) {
    showToast("헤더(" + def.columns.join(" / ") + ")를 찾지 못했거나 데이터 행이 없습니다. 양식을 확인해 주세요.");
    return;
  }
  const cleaned = mapped.rows.filter((r) => !isSampleRow(r.data));
  if (!cleaned.length) { showToast("(예시) 행을 제외하면 등록할 데이터가 없습니다."); return; }

  xlState.rows = cleaned.map((r) => {
    const v = def.validate(r.data, pool);
    return {
      excelRow: r.excelRow, data: r.data, ok: v.ok, reason: v.reason,
      member: v.member, payload: v.payload, dupSkip: false
    };
  });
  if (xlState.mode === "revenue") {
    const { groups, keepLast } = findRevenueDuplicates(xlState.rows);
    xlState.dupGroups = groups;
    xlState.rows.forEach((row, i) => { row.dupSkip = row.ok && !keepLast.has(i); });
  } else {
    xlState.dupGroups = [];
  }
  renderXlPreview();
  showXlStep(2);
}

/* 경고 박스 안에 체크박스 한 개를 만들어 돌려준다 (동적 생성 · textContent 만 사용) */
function buildXlCheck(box, text, checked) {
  box.textContent = "";
  const label = document.createElement("label");
  label.style.cssText = "display:flex;gap:8px;align-items:flex-start;cursor:pointer;";
  const chk = document.createElement("input");
  chk.type = "checkbox";
  chk.checked = !!checked;
  chk.style.cssText = "width:16px;height:16px;margin-top:2px;flex:0 0 auto;accent-color:#2163F2;";
  const span = document.createElement("span");
  span.textContent = text;
  label.appendChild(chk);
  label.appendChild(span);
  box.appendChild(label);
  box.style.display = "";
  return chk;
}

function renderXlPreview() {
  const def = xlMode();
  if (!def) return;

  const head = $("#xlHeadRow");
  head.textContent = "";
  ["엑셀 행", "상태"].concat(def.columns).concat(["사유"]).forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    head.appendChild(th);
  });

  const body = $("#xlBody");
  body.textContent = "";
  xlState.rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = row.ok ? "xl-row-ok" : "xl-row-ng";

    const tdNo = document.createElement("td");
    tdNo.className = "no";
    tdNo.textContent = row.excelRow;
    tr.appendChild(tdNo);

    const tdSt = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "xl-state " + (row.ok ? "ok" : "ng");
    badge.textContent = row.ok ? (row.dupSkip ? "중복" : "정상") : "오류";
    tdSt.appendChild(badge);
    tr.appendChild(tdSt);

    def.cells(row).forEach((v) => {
      const td = document.createElement("td");
      td.textContent = (v === null || v === undefined) ? "" : String(v);
      tr.appendChild(td);
    });

    const tdReason = document.createElement("td");
    tdReason.className = "xl-reason";
    tdReason.textContent = row.ok
      ? (row.dupSkip ? "파일 안에 같은 (인플루언서, 연월) 이 더 있습니다." : "")
      : row.reason;
    tr.appendChild(tdReason);

    body.appendChild(tr);
  });

  const total = xlState.rows.length;
  const ng = xlState.rows.filter((r) => !r.ok).length;
  const ok = total - ng;

  const sum = $("#xlSummary");
  sum.textContent = "";
  [["total", "총 " + total + "행"], ["ok", "정상 " + ok + "행"], ["ng", "오류 " + ng + "행"]]
    .forEach(([cls, text]) => {
      const pill = document.createElement("span");
      pill.className = "xl-pill " + cls;
      pill.textContent = text;
      sum.appendChild(pill);
    });
  const fname = document.createElement("span");
  fname.className = "hint";
  fname.style.marginLeft = "4px";
  fname.textContent = "파일: " + xlState.fileName;   /* 파일명도 textContent 로만 */
  sum.appendChild(fname);

  /* 오류 행이 있으면 '정상 행만 등록' 여부를 명시적으로 확인받는다 */
  xlErrCheckbox = null;
  if (ng) {
    xlErrCheckbox = buildXlCheck($("#xlErrWarn"),
      "오류 행 " + ng + "건이 있습니다. 오류 행은 건너뛰고 정상 " + ok + "행만 등록합니다. " +
      "(체크를 해제하면 실행할 수 없습니다. 오류를 고쳐 다시 올리려면 [다시 선택])", true);
    xlErrCheckbox.addEventListener("change", updateXlRunButton);
  } else {
    $("#xlErrWarn").style.display = "none";
    $("#xlErrWarn").textContent = "";
  }

  /* (인플루언서, 연월) 중복 확인 */
  xlDupCheckbox = null;
  const dupGroups = xlState.dupGroups || [];
  if (dupGroups.length) {
    const dupRows = dupGroups.reduce((n, g) => n + g.indexes.length, 0);
    xlDupCheckbox = buildXlCheck($("#xlDupWarn"),
      "같은 (인플루언서, 연월) 조합이 " + dupGroups.length + "건(총 " + dupRows + "행) 중복됩니다. " +
      "체크하면 각 조합의 '마지막 행 값'만 등록합니다. 체크를 해제하면 파일에 적힌 순서대로 모두 등록합니다. " +
      "(revenueUpsert 이므로 어느 쪽이든 최종 저장 값은 마지막 행의 값입니다)", true);
    xlDupCheckbox.addEventListener("change", updateXlRunButton);
  } else {
    $("#xlDupWarn").style.display = "none";
    $("#xlDupWarn").textContent = "";
  }

  $("#xlPreviewHint").textContent =
    "위 표는 실제 등록될 값입니다. 확인 후 [등록 실행] 을 눌러 주세요. (페이지 이동 없이 전체 행을 표시합니다)";
  updateXlRunButton();
}

function xlTargets() {
  const useLast = !xlDupCheckbox || xlDupCheckbox.checked;
  return xlState.rows.filter((r) => r.ok && !(useLast && r.dupSkip));
}

function updateXlRunButton() {
  const btn = $("#btnXlRun");
  const n = xlTargets().length;
  const errBlocked = !!(xlErrCheckbox && !xlErrCheckbox.checked);
  btn.disabled = (n === 0) || errBlocked;
  btn.textContent = errBlocked
    ? "확인 체크 후 실행할 수 있습니다"
    : (n ? ("정상 " + n + "행 등록 실행") : "등록할 정상 행이 없습니다");
}

function setXlProgress(done, total) {
  $("#xlProgress").textContent = done + " / " + total;
  $("#xlBar").style.width = total ? Math.round((done / total) * 100) + "%" : "0%";
}
function appendXlLog(state, text) {
  const log = $("#xlLog");
  const line = document.createElement("div");
  if (state === "실패") line.className = "ng";
  line.textContent = "[" + state + "] " + text;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

$("#btnXlBack").addEventListener("click", () => {
  $("#xlFile").value = "";
  xlState.rows = [];
  showXlStep(1);
});

$("#btnXlAbort").addEventListener("click", () => {
  if (!xlState.running) return;
  xlState.aborted = true;
  $("#btnXlAbort").disabled = true;
  showToast("현재 처리 중인 1건이 끝나면 중단됩니다.");
});

$("#btnXlRun").addEventListener("click", () => { runExcelUpload(); });

async function runExcelUpload() {
  const def = xlMode();
  if (!def || xlState.running) return;
  const targets = xlTargets();
  if (!targets.length) { showToast("등록할 정상 행이 없습니다."); return; }

  xlState.running = true;
  xlState.aborted = false;
  showXlStep(3);
  $("#btnXlAbort").style.display = "";
  $("#btnXlAbort").disabled = false;
  $("#btnXlClose").disabled = true;
  $("#xlLog").textContent = "";
  $("#xlRunTitle").textContent =
    targets.length + "행을 순차 등록합니다. 건당 2~4초가 걸리며, 중간에 실패해도 나머지 행은 계속 진행합니다.";
  setXlProgress(0, targets.length);

  let done = 0, okCnt = 0, failCnt = 0;
  const failures = [];
  for (const row of targets) {
    if (xlState.aborted) break;
    try {
      await api(def.action, row.payload);
      okCnt++;
      appendXlLog("성공", row.excelRow + "행 · " + def.rowLabel(row));
    } catch (err) {
      failCnt++;
      const msg = (err && err.message) || "알 수 없는 오류";
      failures.push(row.excelRow + "행 · " + def.rowLabel(row) + " → " + msg);
      appendXlLog("실패", row.excelRow + "행 · " + def.rowLabel(row) + " → " + msg);
    }
    done++;
    setXlProgress(done, targets.length);
  }

  xlState.running = false;
  $("#btnXlAbort").style.display = "none";
  $("#btnXlClose").disabled = false;

  const notRun = targets.length - done;
  $("#xlRunTitle").textContent =
    (xlState.aborted ? "사용자 요청으로 중단되었습니다. " : "업로드가 완료되었습니다. ") +
    "성공 " + okCnt + "건 / 실패 " + failCnt + "건" + (notRun ? " / 미실행 " + notRun + "건" : "") + ".";
  if (failures.length) {
    appendXlLog("요약", "실패 " + failures.length + "건 — 위 목록의 사유를 확인한 뒤 해당 행만 다시 올려 주세요.");
  }
  showToast("엑셀 업로드 완료 — 성공 " + okCnt + "건, 실패 " + failCnt + "건");

  /* 목록 자동 새로고침 (실패해도 업로드 결과에는 영향을 주지 않는다) */
  try { await def.after(); } catch (e) { /* 무시 */ }
}

/* 업로드 진행 중에는 모달이 닫히지 않도록 한다 (닫아도 실행은 계속되지만 진행 상황을 잃는다) */
$("#excelModal").addEventListener("click", (e) => {
  if (!xlState.running) return;
  if (e.target.closest && e.target.closest("#btnXlAbort")) return;
  if (e.target === e.currentTarget || (e.target.closest && e.target.closest("[data-close]"))) {
    e.stopPropagation();
    showToast("업로드가 진행 중입니다. 멈추려면 [중단] 을 눌러 주세요.");
  }
}, true);

/* ---------- 초기화: 세션 토큰이 있으면 자동 진입 ---------- */
(async function init() {
  updateMaskButton();
  /* SheetJS 로드 여부 확인 → 실패 시 엑셀 버튼만 비활성 + 안내 (다른 기능은 그대로) */
  applyXlsxAvailability();
  /* 발송 계정·메시지 기본값 채우고 안내 문구 초기화 */
  if ($("#inviteSender") && !$("#inviteSender").value) $("#inviteSender").value = DEFAULT_SENDER;
  if ($("#inviteMessage") && !$("#inviteMessage").value) $("#inviteMessage").value = DEFAULT_MESSAGE;
  updateDmGuide();
  /* 수익 관리: 연월 기본값 = 이번 달 */
  if ($("#revYm") && !$("#revYm").value) $("#revYm").value = currentYm();
  /* 링크 추가 모달 유효시작일 기본값 = 오늘 */
  if ($("#lk-start") && !$("#lk-start").value) $("#lk-start").value = todayYmd();
  if (sessionStorage.getItem("lf_admin_token")) {
    showAdmin();
    try { await loadList(); await loadInvites(); }
    catch (e) { showLogin(); }
  } else {
    showLogin();
  }
})();
