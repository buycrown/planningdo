/* =========================================================
 * LFmall 인플루언서 어필리에이트 신청 - app.js
 * =========================================================
 * [설정 안내]
 * 1) APPS_SCRIPT_URL : Google Apps Script 배포 후 발급되는 웹앱 URL을 넣어주세요.
 *    (배포 방법은 README.md 참고)  비워두면 '데모 모드'로 동작하여
 *    실제 전송 없이 전송 데이터가 콘솔에 출력됩니다.
 * 2) RECIPIENTS : 신청 내용을 수신할 이메일 주소 목록입니다.
 *    배열에 주소를 추가/삭제하는 것만으로 수신자를 자유롭게 변경할 수 있습니다.
 *
 * [의존성] 같은 폴더의 auth.js(window.LFAuth)를 이 파일보다 먼저 로드해야 합니다.
 *          비밀번호 정책 검증·키 스트레칭(PBKDF2)을 담당합니다.
 *          평문 비밀번호는 payload·콘솔·메일 어디에도 남기지 않습니다.
 * ========================================================= */
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwVjfkUZPKJfF7Ma6AriDgkbMISNTH7qaCh_Os5TgLkF5hx7rYFNocDLmZl3LyEr1J6Ug/exec",
  RECIPIENTS: [
    "buycrown@lfcorp.com",
    "yr.kwon@lfcorp.com"
    // 수신자를 추가하려면 이 아래에 "이메일주소" 형태로 한 줄씩 추가하세요.
  ],
  MAX_FILE_SIZE: 10 * 1024 * 1024 // 10MB
};

/* =========================================================
 * SNS 채널 - 순수 로직 (DOM 비의존)
 * ---------------------------------------------------------
 * 아래 @pure 구간은 브라우저 DOM 없이 그대로 실행할 수 있어야 합니다.
 * (공용_서버_문서/_테스트하네스/sns-order.js 가 이 구간만 잘라내 Node 에서 검증)
 * 서버는 snsChannels 배열의 '순서'로 대표채널(신청내역 21열)을 결정하므로
 * 화면의 위 -> 아래 순서가 배열 순서와 반드시 일치해야 합니다. (SPEC §3-3)
 * ========================================================= */
/* @pure:sns-start */
/* SNS 채널별 자동 기입 도메인 */
const SNS_CHANNELS = {
  instagram: { label: "Instagram",  domain: "https://www.instagram.com/" },
  youtube:   { label: "YouTube",    domain: "https://www.youtube.com/@" },
  x:         { label: "X (Twitter)",domain: "https://x.com/" },
  tiktok:    { label: "TikTok",     domain: "https://www.tiktok.com/@" }
};

/**
 * 입력 행 목록 -> 서버 전송용 snsChannels 배열.
 * - 배열 순서 = 넘겨받은 rows 순서(= 화면 위에서 아래) 이며 [0] 이 대표 채널이 된다.
 * - 같은 유형을 여러 개 입력해도 합치거나 버리지 않는다. (서버가 줄바꿈으로 병기 저장)
 * - 채널 미선택 / 미입력 / 도메인만 자동 기입된 행은 제외한다.
 * @param {Array<{key:String,url:String}>} rows 위에서부터 순서대로
 * @param {Object} [defs] 채널 정의 (기본 SNS_CHANNELS)
 * @returns {Array<{channel:String,url:String}>}
 */
function buildSnsChannels(rows, defs) {
  const map = defs || SNS_CHANNELS;
  const out = [];
  (rows || []).forEach((r) => {
    if (!r) return;
    const key = String(r.key == null ? "" : r.key);
    const url = String(r.url == null ? "" : r.url).trim();
    const def = map[key];
    if (!def || !url) return;        // 채널 미선택 · 주소 미입력
    if (url === def.domain) return;  // 도메인만 채워진 상태 = 미입력으로 간주
    out.push({ channel: def.label, url: url });
  });
  return out;
}

/**
 * 행 순서를 한 칸 올린다(↑). 원본 배열은 건드리지 않고 새 배열을 반환한다.
 * 맨 위 행(0) 또는 범위를 벗어난 index 는 순서를 바꾸지 않는다.
 * @param {Array} list
 * @param {Number} index
 * @returns {Array}
 */
function moveSnsRowUp(list, index) {
  const out = (list || []).slice();
  if (!(index > 0) || index >= out.length) return out;
  const prev = out[index - 1];
  out[index - 1] = out[index];
  out[index] = prev;
  return out;
}
/* @pure:sns-end */

/* ---------- 공통 헬퍼 ---------- */
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showToast(msg) {
  const toast = $("#toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 2600);
}

function setFieldError(fieldId, hasError) {
  const field = document.getElementById(fieldId);
  if (field) field.classList.toggle("invalid", hasError);
}

/* =========================================================
 * 0. 보안 컨텍스트 점검 (WebCrypto)
 * ---------------------------------------------------------
 * 비밀번호 해싱(PBKDF2)은 HTTPS 또는 http://localhost 에서만 동작합니다.
 * file:// 로 직접 열면 가입을 진행할 수 없으므로 상단에 경고 배너를 노출하고
 * 제출 버튼을 비활성화합니다. (refreshSubmitState 참고)
 * ========================================================= */
const AUTH_READY = !!window.LFAuth;
const SECURE_OK = AUTH_READY && LFAuth.isSecureContextOk();

if (!SECURE_OK) {
  $("#secureWarnText").textContent = AUTH_READY
    ? LFAuth.INSECURE_MSG
    : "인증 모듈(auth.js)을 불러오지 못했습니다. index.html 과 같은 폴더에 auth.js 가 있는지 확인해 주세요.";
  $("#secureWarn").hidden = false;
}

/* =========================================================
 * 0-1. 서버 배포 버전 점검 (자가 진단)
 * ---------------------------------------------------------
 * Apps Script 는 코드를 수정해도 '새 버전으로 재배포' 하지 않으면 구버전이 계속 응답합니다.
 * 이 경우 가입은 성공한 것처럼 보이지만 비밀번호가 저장되지 않아
 * 나중에 로그인이 되지 않습니다. → 진입 시점에 감지해 아예 제출을 막습니다.
 * ========================================================= */
let serverOutdated = false;

function checkServerVersion() {
  if (!AUTH_READY || !LFAuth.checkServer) return;
  if (!CONFIG.APPS_SCRIPT_URL) return;              // 데모 모드에서는 확인하지 않음
  LFAuth.config({ apiUrl: CONFIG.APPS_SCRIPT_URL }); // 화면 설정값을 공용 모듈에 맞춘다
  LFAuth.checkServer().then((info) => {
    if (!info || !info.outdated) return;
    serverOutdated = true;
    /* 보안 컨텍스트 경고와 동일한 배너 UI를 재사용 (textContent 로만 주입) */
    $("#secureWarnText").textContent = info.message;
    $("#secureWarn").hidden = false;
    refreshSubmitState();
  }).catch(() => { /* 네트워크 오류는 제출 시점에 다시 안내된다 */ });
}

/** 서버로 보낼 신청일시 : KST 기준 'YYYY-MM-DD HH:mm:ss'
 *  (toLocaleString 계열은 "2026. 8. 4. 오후 10:00:00" 형태라 서버·시트에서 파싱이 어긋납니다) */
function nowKstStamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).formatToParts(new Date()).reduce((o, p) => (o[p.type] = p.value, o), {});
  const hh = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day} ${hh}:${parts.minute}:${parts.second}`;
}

/* =========================================================
 * 1. SNS 채널 다중 입력
 * ---------------------------------------------------------
 * 서버는 전송 배열의 첫 번째 채널을 '대표채널'로 저장합니다.
 * 따라서 화면의 행 순서(위 -> 아래)가 곧 전송 순서이며,
 *   · 맨 위 행에 '대표' 뱃지를 표시하고
 *   · 각 행의 ↑ 버튼으로 순서를 바꿀 수 있게 합니다. (맨 위 행의 ↑ 는 비활성)
 * ========================================================= */
/* @dom:sns-start */
const snsList = $("#snsList");

/** 행 추가/삭제/이동 후 상태 갱신 : 대표 뱃지는 항상 맨 위 행에만 붙는다. */
function refreshSnsRows() {
  const rows = [...snsList.querySelectorAll(".sns-row")];
  rows.forEach((row, i) => {
    const badge = row.querySelector(".sns-row__badge");
    if (badge) badge.hidden = i !== 0;
    const up = row.querySelector(".btn-move-up");
    if (up) {
      up.disabled = i === 0;                       // 맨 위 행은 더 올릴 곳이 없다
      up.setAttribute("aria-label", i === 0 ? "맨 위 채널입니다" : "채널 순서 위로 이동");
    }
  });
}

function createSnsRow() {
  const row = document.createElement("div");
  row.className = "sns-row";

  /* 대표 채널 뱃지 (맨 위 행에만 노출 — refreshSnsRows 가 관리) */
  const badge = document.createElement("span");
  badge.className = "sns-row__badge";
  badge.textContent = "대표";
  badge.hidden = true;

  const ctrl = document.createElement("div");
  ctrl.className = "sns-row__ctrl";

  /* 채널 선택 셀렉트 */
  const select = document.createElement("select");
  select.setAttribute("aria-label", "SNS 채널 선택");
  const placeholderOpt = new Option("채널 선택", "");
  placeholderOpt.disabled = true;
  placeholderOpt.selected = true;
  select.appendChild(placeholderOpt);
  Object.entries(SNS_CHANNELS).forEach(([key, ch]) => {
    select.appendChild(new Option(ch.label, key));
  });

  /* URL 입력 */
  const input = document.createElement("input");
  input.type = "url";
  input.className = "sns-url";
  input.placeholder = "채널을 먼저 선택해 주세요";
  input.setAttribute("aria-label", "SNS 채널 주소");
  /* 모바일 키보드 최적화: URL 키보드 + 자동 대문자/교정 방지 */
  input.setAttribute("inputmode", "url");
  input.setAttribute("autocapitalize", "none");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("spellcheck", "false");
  input.setAttribute("enterkeyhint", "next");

  /* 채널 선택 시 도메인 자동 기입 */
  select.addEventListener("change", () => {
    const newDomain = SNS_CHANNELS[select.value].domain;
    const prevDomain = select.dataset.prevDomain || "";
    if (!input.value || input.value === prevDomain) {
      input.value = newDomain;               // 비어있으면 도메인 채우기
    } else if (prevDomain && input.value.startsWith(prevDomain)) {
      input.value = newDomain + input.value.slice(prevDomain.length); // 도메인만 교체
    } else if (!input.value.startsWith(newDomain)) {
      input.value = newDomain + input.value.replace(/^https?:\/\/[^/]*\/?@?/, "");
    }
    select.dataset.prevDomain = newDomain;
    input.placeholder = newDomain + "채널ID";
    input.focus();
  });

  /* 순서 올리기 버튼 (대표 채널 변경 수단) */
  const btnUp = document.createElement("button");
  btnUp.type = "button";
  btnUp.className = "btn-move-up";
  btnUp.textContent = "↑";
  btnUp.setAttribute("aria-label", "채널 순서 위로 이동");
  btnUp.addEventListener("click", () => {
    const prev = row.previousElementSibling;
    if (!prev) return;                       // 이미 맨 위
    snsList.insertBefore(row, prev);
    refreshSnsRows();
    /* 맨 위로 올라가 버튼이 비활성화되면 포커스가 사라지므로 셀렉트로 옮긴다 */
    if (btnUp.disabled) select.focus(); else btnUp.focus();
  });

  /* 행 삭제 버튼 */
  const btnRemove = document.createElement("button");
  btnRemove.type = "button";
  btnRemove.className = "btn-remove";
  btnRemove.textContent = "−";
  btnRemove.setAttribute("aria-label", "채널 삭제");
  btnRemove.addEventListener("click", () => {
    if (snsList.children.length <= 1) {
      showToast("최소 1개의 SNS 채널 입력란이 필요합니다.");
      return;
    }
    row.remove();
    refreshSnsRows();                        // 삭제로 맨 위가 바뀌면 뱃지도 따라간다
  });

  ctrl.append(select, input, btnUp, btnRemove);
  row.append(badge, ctrl);
  return row;
}

snsList.appendChild(createSnsRow()); // 기본 1행
refreshSnsRows();
$("#btnAddSns").addEventListener("click", () => {
  snsList.appendChild(createSnsRow());
  refreshSnsRows();
  snsList.lastElementChild.querySelector("select").focus();
});

/**
 * 화면의 입력 행을 '위에서 아래' 순서 그대로 읽는다.
 * querySelectorAll 은 문서 순서(document order)를 보장하므로
 * 반환 배열의 0번이 화면 맨 위 행 = 대표 채널이다.
 */
function readSnsRows() {
  return [...snsList.querySelectorAll(".sns-row")].map((row) => ({
    key: row.querySelector("select").value,
    url: row.querySelector(".sns-url").value
  }));
}

function collectSnsChannels() {
  return buildSnsChannels(readSnsRows());
}
/* @dom:sns-end */

/* =========================================================
 * 2. 휴대폰번호 자동 하이픈
 * ========================================================= */
$("#phone").addEventListener("input", (e) => {
  const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
  let out = digits;
  if (digits.length > 7)      out = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  else if (digits.length > 3) out = `${digits.slice(0, 3)}-${digits.slice(3)}`;
  e.target.value = out;
});

/* =========================================================
 * 2-1. 사업자 유무 → 첨부파일 안내 문구 연동
 * ========================================================= */
function getBizStatus() {
  const checked = document.querySelector('input[name="biz"]:checked');
  return checked ? checked.value : "";
}

function updateFileGuide() {
  const guide = $("#fileGuideDocs");
  const biz = getBizStatus();
  if (biz === "사업자 있음") {
    guide.textContent = "사업자등록증, 신분증, 통장 사본을 업로드 해주세요.";
  } else if (biz === "사업자 없음") {
    guide.textContent = "신분증, 통장 사본을 업로드 해주세요.";
  } else {
    guide.textContent = "사업자 유무 선택 시 필요한 서류를 안내해 드립니다.";
  }
}

$$('input[name="biz"]').forEach((radio) =>
  radio.addEventListener("change", () => {
    setFieldError("field-biz", false);
    updateFileGuide();
  })
);
updateFileGuide();

/* =========================================================
 * 3. 파일 첨부 (여러 개 가능, 총 용량 10MB 이하)
 * ========================================================= */
let attachedFiles = [];
const fileDrop = $("#fileDrop");
const fileInput = $("#fileInput");

function totalFileSize(files) {
  return files.reduce((sum, f) => sum + f.size, 0);
}

function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function addFiles(newFiles) {
  if (!newFiles || newFiles.length === 0) return;
  const candidates = [...newFiles].filter(
    (nf) => !attachedFiles.some((f) => f.name === nf.name && f.size === nf.size) // 동일 파일 중복 방지
  );
  const merged = [...attachedFiles, ...candidates];
  if (totalFileSize(merged) > CONFIG.MAX_FILE_SIZE) {
    setFieldError("field-file", true);
    showToast(
      "첨부파일 총 용량은 10MB 이하여야 합니다. (현재 시도: " + formatMB(totalFileSize(merged)) + ")"
    );
    fileInput.value = "";
    return;
  }
  setFieldError("field-file", false);
  attachedFiles = merged;
  fileInput.value = ""; // 같은 파일 재선택 가능하도록 초기화
  renderFileList();
}

function removeFile(index) {
  attachedFiles.splice(index, 1);
  setFieldError("field-file", false);
  renderFileList();
}

function renderFileList() {
  const list = $("#fileList");
  list.innerHTML = "";
  attachedFiles.forEach((file, idx) => {
    const item = document.createElement("div");
    item.className = "file-item";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = file.name;

    const size = document.createElement("span");
    size.className = "size";
    size.textContent = formatMB(file.size);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-file-remove";
    btn.textContent = "✕";
    btn.setAttribute("aria-label", file.name + " 삭제");
    btn.addEventListener("click", () => removeFile(idx));

    item.append(name, size, btn);
    list.appendChild(item);
  });

  const total = $("#fileTotal");
  if (attachedFiles.length > 0) {
    total.textContent =
      "총 " + attachedFiles.length + "개 · " + formatMB(totalFileSize(attachedFiles)) + " / 10 MB";
    total.classList.add("show");
  } else {
    total.classList.remove("show");
  }
}

fileDrop.addEventListener("click", () => fileInput.click());
fileDrop.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener("change", () => addFiles(fileInput.files));

["dragenter", "dragover"].forEach((ev) =>
  fileDrop.addEventListener(ev, (e) => { e.preventDefault(); fileDrop.classList.add("dragover"); })
);
["dragleave", "drop"].forEach((ev) =>
  fileDrop.addEventListener(ev, (e) => { e.preventDefault(); fileDrop.classList.remove("dragover"); })
);
fileDrop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]); // data: 접두어 제거
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* =========================================================
 * 4. 비밀번호 (표시 토글 · 실시간 정책 검증 · 강도 인디케이터)
 * ---------------------------------------------------------
 * - 정책 검증은 공용 모듈 LFAuth.validatePassword() 로 단일화합니다.
 * - 평문 비밀번호는 화면 밖으로 나가지 않습니다.
 *   (제출 시 LFAuth.makeCredential() 로 해싱한 값만 전송)
 * ========================================================= */
const pwInput = $("#password");
const pwConfirmInput = $("#passwordConfirm");
const pwStrength = $("#pwStrength");
const pwStrengthLabel = $("#pwStrengthLabel");
const pwMsgs = $("#pwMsgs");
const pwMatchMsg = $("#pwMatchMsg");

/* 이메일 아이디부·휴대폰 뒷자리 포함 여부까지 검사하기 위한 컨텍스트 */
function pwContext() {
  return { email: $("#email").value.trim(), phone: $("#phone").value.trim() };
}

function checkPasswordPolicy() {
  if (!AUTH_READY) return { ok: false, level: 0, messages: [] };
  return LFAuth.validatePassword(pwInput.value, pwContext());
}

/* 검증 메시지 렌더 (textContent 만 사용 — 사용자 입력을 HTML로 삽입하지 않음) */
function renderPwMsgs(messages, okMessage) {
  pwMsgs.innerHTML = "";
  messages.forEach((msg) => {
    const li = document.createElement("li");
    li.textContent = msg;
    pwMsgs.appendChild(li);
  });
  if (okMessage) {
    const li = document.createElement("li");
    li.className = "ok";
    li.textContent = okMessage;
    pwMsgs.appendChild(li);
  }
}

/**
 * 비밀번호 입력 상태 갱신.
 * @param {boolean} showEmptyError 미입력일 때도 안내 문구를 노출할지 여부
 * @returns {boolean} 정책 통과 여부
 */
function refreshPasswordUi(showEmptyError) {
  if (!pwInput.value) {
    pwStrength.hidden = true;
    renderPwMsgs(showEmptyError ? ["비밀번호를 입력해 주세요."] : []);
    setFieldError("field-password", !!showEmptyError);
    return false;
  }

  const result = checkPasswordPolicy();
  pwStrength.hidden = false;
  pwStrength.dataset.level = String(result.level);
  pwStrengthLabel.textContent = AUTH_READY ? LFAuth.strengthLabel(result.level) : "";
  renderPwMsgs(result.messages, result.ok ? "사용할 수 있는 비밀번호입니다." : "");
  setFieldError("field-password", !result.ok);
  return result.ok;
}

/**
 * 비밀번호 확인 상태 갱신. 불일치 시 즉시 안내합니다.
 * @returns {boolean} 일치 여부
 */
function refreshPasswordConfirmUi(showEmptyError) {
  if (!pwConfirmInput.value) {
    pwMatchMsg.textContent = showEmptyError ? "비밀번호 확인을 입력해 주세요." : "";
    pwMatchMsg.className = showEmptyError ? "pw-match err" : "pw-match";
    setFieldError("field-passwordConfirm", !!showEmptyError);
    return false;
  }

  const matched = pwInput.value === pwConfirmInput.value;
  pwMatchMsg.textContent = matched ? "비밀번호가 일치합니다." : "비밀번호가 일치하지 않습니다.";
  pwMatchMsg.className = "pw-match " + (matched ? "ok" : "err");
  setFieldError("field-passwordConfirm", !matched);
  return matched;
}

/* 미입력 · 정책 위반 · 불일치 중 하나라도 있으면 제출 불가 */
function isPasswordReady() {
  if (!pwInput.value || !pwConfirmInput.value) return false;
  if (pwInput.value !== pwConfirmInput.value) return false;
  return checkPasswordPolicy().ok;
}

/* 👁 표시/숨김 토글 (44×44px, aria-pressed 관리) */
$$(".pw-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = document.getElementById(btn.dataset.target);
    const show = btn.getAttribute("aria-pressed") !== "true";
    const label = target.id === "password" ? "비밀번호" : "비밀번호 확인";
    target.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", show ? "true" : "false");
    btn.setAttribute("aria-label", label + (show ? " 숨기기" : " 표시"));
    /* 토글 후에도 커서를 입력 끝에 유지 */
    const pos = target.value.length;
    target.focus();
    try { target.setSelectionRange(pos, pos); } catch (err) { /* 일부 브라우저 예외 무시 */ }
  });
});

pwInput.addEventListener("input", () => {
  refreshPasswordUi(false);
  if (pwConfirmInput.value) refreshPasswordConfirmUi(false);
  refreshSubmitState();
});
pwConfirmInput.addEventListener("input", () => {
  refreshPasswordConfirmUi(false);
  refreshSubmitState();
});

/* 이메일·휴대폰번호가 바뀌면 '아이디 포함 금지' 규칙을 다시 검사 */
["#email", "#phone"].forEach((sel) => {
  $(sel).addEventListener("input", () => {
    if (pwInput.value) refreshPasswordUi(false);
    refreshSubmitState();
  });
});

/* =========================================================
 * 5. 약관 동의 (전체 동의 + 개별 동의 + 버튼 활성화)
 * ========================================================= */
const agreeAll = $("#agreeAll");
const agreeItems = [...$$(".agree-item")];
const btnSubmit = $("#btnSubmit");

function refreshSubmitState() {
  const allChecked = agreeItems.every((c) => c.checked);
  agreeAll.checked = allChecked;
  /* 필수 약관 미동의 · 비밀번호 미완성 · 보안 컨텍스트 불가 · 서버 구버전 시 신청하기 비활성화 */
  btnSubmit.disabled = !allChecked || !isPasswordReady() || !SECURE_OK || serverOutdated;
}

agreeAll.addEventListener("change", () => {
  agreeItems.forEach((c) => (c.checked = agreeAll.checked));
  refreshSubmitState();
});
agreeItems.forEach((c) => c.addEventListener("change", refreshSubmitState));
refreshSubmitState();

/* 배너·버튼 상태 함수가 모두 준비된 뒤 서버 버전을 확인한다 */
checkServerVersion();

/* =========================================================
 * 6. 약관 '자세히 보기' 모달
 * ========================================================= */
$$(".btn-terms-view").forEach((btn) => {
  btn.addEventListener("click", () => {
    const modal = document.getElementById(btn.dataset.modal);
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  });
});
$$(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest("[data-close]")) {
      overlay.classList.remove("show");
      overlay.setAttribute("aria-hidden", "true");
    }
  });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $$(".modal-overlay.show").forEach((m) => {
      m.classList.remove("show");
      m.setAttribute("aria-hidden", "true");
    });
  }
});

/* =========================================================
 * 7. 입력 검증
 * ========================================================= */
function validateForm() {
  let ok = true;
  const focusTargets = [];

  const email = $("#email").value.trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  setFieldError("field-email", !emailOk);
  if (!emailOk) { ok = false; focusTargets.push($("#email")); }

  const nameOk = $("#name").value.trim().length > 0;
  setFieldError("field-name", !nameOk);
  if (!nameOk) { ok = false; focusTargets.push($("#name")); }

  const nickOk = $("#nickname").value.trim().length > 0;
  setFieldError("field-nickname", !nickOk);
  if (!nickOk) { ok = false; focusTargets.push($("#nickname")); }

  const catOk = [...$$('input[name="category"]:checked')].length > 0;
  setFieldError("field-category", !catOk);
  if (!catOk) ok = false;

  const phoneOk = /^01[016789]-\d{3,4}-\d{4}$/.test($("#phone").value.trim());
  setFieldError("field-phone", !phoneOk);
  if (!phoneOk) { ok = false; focusTargets.push($("#phone")); }

  /* 비밀번호 : 미입력 · 정책 위반 · 불일치 모두 오류 처리 */
  const pwOk = refreshPasswordUi(true);
  if (!pwOk) { ok = false; focusTargets.push(pwInput); }

  const pwConfirmOk = refreshPasswordConfirmUi(true) && pwOk;
  if (!pwConfirmOk) { ok = false; focusTargets.push(pwConfirmInput); }

  const bizOk = getBizStatus() !== "";
  setFieldError("field-biz", !bizOk);
  if (!bizOk) ok = false;

  const snsOk = collectSnsChannels().length > 0;
  setFieldError("field-sns", !snsOk);
  if (!snsOk) ok = false;

  if (!ok) {
    showToast("입력하지 않은 항목이 있습니다. 확인해 주세요.");
    if (focusTargets[0]) focusTargets[0].focus();
  }
  return ok;
}

/* 입력 시 에러 표시 해제 */
["email", "name", "nickname", "phone"].forEach((id) => {
  document.getElementById(id).addEventListener("input", () => setFieldError("field-" + id, false));
});
$("#categoryChips").addEventListener("change", () => setFieldError("field-category", false));
$("#snsList").addEventListener("input", () => setFieldError("field-sns", false));

/* =========================================================
 * 8. 제출 (Google Apps Script로 전송)
 * ========================================================= */
const dupNotice = $("#dupNotice");

function hideDuplicateNotice() {
  dupNotice.hidden = true;
}

/* 서버가 code:'DUPLICATE' 로 응답한 경우 → 로그인 화면 안내 */
function showDuplicateNotice() {
  dupNotice.hidden = false;
  dupNotice.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* 콘솔 출력용 마스킹 : 비밀번호 관련 값과 첨부파일 본문은 남기지 않습니다. */
function maskPayloadForLog(payload) {
  return Object.assign({}, payload, {
    pwCsalt: "(masked)",
    pwClientHash: "(masked)",
    attachments: payload.attachments.map((a) => ({
      fileName: a.fileName,
      mimeType: a.mimeType,
      base64: "(masked · " + a.base64.length + " chars)"
    }))
  });
}

$("#applyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (btnSubmit.disabled) return;
  if (!validateForm()) return;

  hideDuplicateNotice();

  const loading = $("#loadingOverlay");
  loading.classList.add("show");
  btnSubmit.disabled = true;

  let payload;
  try {
    /* 평문 비밀번호는 절대 전송하지 않습니다.
       클라이언트에서 PBKDF2-SHA256(120,000회)로 키 스트레칭한 값만 서버로 보냅니다. */
    const credential = await LFAuth.makeCredential(pwInput.value);

    payload = {
      recipients: CONFIG.RECIPIENTS,
      email: $("#email").value.trim(),
      name: $("#name").value.trim(),
      nickname: $("#nickname").value.trim(),
      categories: [...$$('input[name="category"]:checked')].map((c) => c.value),
      phone: $("#phone").value.trim(),
      bizStatus: getBizStatus(),
      snsChannels: collectSnsChannels(),
      pwCsalt: credential.csalt,
      pwClientHash: credential.clientHash,
      /* 'YYYY-MM-DD HH:mm:ss' (KST) — 서버·시트가 동일 규칙으로 파싱할 수 있는 형식 */
      submittedAt: nowKstStamp(),
      attachments: []
    };

    for (const file of attachedFiles) {
      payload.attachments.push({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        base64: await fileToBase64(file)
      });
    }
  } catch (err) {
    console.error(err);
    loading.classList.remove("show");
    showToast(
      err && err.code === "INSECURE_CONTEXT"
        ? "보안 연결(HTTPS) 환경에서만 신청할 수 있습니다."
        : "신청서를 준비하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
    );
    refreshSubmitState();
    return;
  }

  /* 데모 모드 : Apps Script URL 미설정 시 (비밀번호 관련 값은 마스킹) */
  if (!CONFIG.APPS_SCRIPT_URL) {
    console.log("[데모 모드] 전송 데이터 ▼ (비밀번호 관련 값은 마스킹됩니다)");
    console.log(maskPayloadForLog(payload));
    showToast("데모 모드: 전송 데이터가 콘솔(F12)에 출력되었습니다.");
    loading.classList.remove("show");
    finishSubmit();
    return;
  }

  try {
    /* text/plain 전송: Apps Script CORS preflight 회피용 (서버에서 JSON 파싱) */
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    const result = await res.json().catch(() => null);
    /* 성공 응답(status:"ok")을 명시적으로 확인해야 함.
       - Apps Script 배포 시 '액세스 권한'이 '모든 사용자'가 아니면
         로그인 HTML 페이지가 200으로 응답되어 가짜 성공이 될 수 있음 */
    if (!res.ok || !result || result.status !== "ok") {
      const error = new Error(
        (result && result.message) ||
        "전송 결과를 확인할 수 없습니다. Apps Script 배포 설정(액세스 권한: '모든 사용자')을 확인해 주세요."
      );
      error.code = result && result.code; // 'DUPLICATE' / 'PW_REQUIRED' 등 서버 오류 코드 보존
      /* 구버전 서버 : submit 자체는 처리되지만 다른 v2 액션이 없는 상태 */
      if (result && String(result.message || "").indexOf("알 수 없는 요청입니다") !== -1) {
        error.code = "OUTDATED_SERVER";
      }
      throw error;
    }
    /* 첨부파일 업로드만 실패한 경우에도 신청은 접수된다 (서버가 신청 행을 먼저 적재) */
    finishSubmit(result.attachmentWarning === true);
  } catch (err) {
    console.error(err);
    /* 중복 가입 : 로그인 화면으로 유도 */
    if (err && err.code === "DUPLICATE") {
      showDuplicateNotice();
      showToast("이미 신청된 이메일 또는 휴대폰번호입니다.");
      refreshSubmitState();
      return;
    }
    /* 비밀번호 자격증명 누락 : 새로고침 후 재입력 안내 */
    if (err && err.code === "PW_REQUIRED") {
      showToast("비밀번호 정보가 서버에 전달되지 않았습니다. 화면을 새로고침한 뒤 비밀번호를 다시 입력해 주세요.");
      pwInput.value = "";
      pwConfirmInput.value = "";
      refreshPasswordUi(true);
      refreshPasswordConfirmUi(true);
      refreshSubmitState();
      return;
    }
    /* 동시 저장 충돌 : 사용자가 그대로 재시도하면 되는 상황 */
    if (err && err.code === "BUSY") {
      showToast("다른 신청이 처리 중입니다. 잠시 후 [신청하기]를 다시 눌러 주세요.");
      refreshSubmitState();
      return;
    }
    /* 시트 구조 오류 : 사용자가 재시도해도 해결되지 않으므로 담당자 안내 */
    if (err && err.code === "SCHEMA_MISMATCH") {
      $("#secureWarnText").textContent =
        "서버 데이터 저장소 구조에 문제가 있어 신청을 접수할 수 없습니다.\n" +
        "담당자(yr.kwon@lfcorp.com)에게 알려 주세요.";
      $("#secureWarn").hidden = false;
      showToast("서버 설정 문제로 신청을 접수할 수 없습니다. 담당자에게 알려 주세요.");
      refreshSubmitState();
      return;
    }
    /* 서버 구버전 : 코드가 아니라 배포가 문제임을 명확히 안내 */
    if (err && err.code === "OUTDATED_SERVER") {
      serverOutdated = true;
      $("#secureWarnText").textContent = (AUTH_READY && LFAuth.OUTDATED_MSG) || err.message;
      $("#secureWarn").hidden = false;
      showToast("서버가 구버전으로 배포되어 있어 신청을 접수할 수 없습니다. 담당자에게 알려 주세요.");
      refreshSubmitState();
      return;
    }
    /* 원인 파악이 쉽도록 상세 사유를 함께 표시 */
    let detail = err && err.message ? err.message : "";
    if (err instanceof TypeError) {
      detail = "서버에 연결하지 못했습니다. URL이 /exec로 끝나는 웹앱 URL인지, " +
               "배포 액세스 권한이 '모든 사용자'인지 확인해 주세요.";
    }
    showToast("전송 중 오류가 발생했습니다. " + detail);
    refreshSubmitState();
  } finally {
    loading.classList.remove("show");
  }
});

function finishSubmit(attachmentWarning) {
  /* 평문 비밀번호가 DOM에 남지 않도록 즉시 비웁니다. */
  pwInput.value = "";
  pwConfirmInput.value = "";
  /* 첨부파일만 저장에 실패한 경우 안내 (신청 자체는 정상 접수됨) */
  const warn = $("#attachWarn");
  if (warn) warn.hidden = !attachmentWarning;
  $("#formArea").style.display = "none";
  $("#completeArea").classList.add("show");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
