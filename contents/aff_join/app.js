/* =========================================================
 * LFmall 인플루언서 어필리에이트 신청 - app.js
 * =========================================================
 * [설정 안내]
 * 1) APPS_SCRIPT_URL : Google Apps Script 배포 후 발급되는 웹앱 URL을 넣어주세요.
 *    (배포 방법은 README.md 참고)  비워두면 '데모 모드'로 동작하여
 *    실제 전송 없이 전송 데이터가 콘솔에 출력됩니다.
 * 2) RECIPIENTS : 신청 내용을 수신할 이메일 주소 목록입니다.
 *    배열에 주소를 추가/삭제하는 것만으로 수신자를 자유롭게 변경할 수 있습니다.
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

/* SNS 채널별 자동 기입 도메인 */
const SNS_CHANNELS = {
  instagram: { label: "Instagram",  domain: "https://www.instagram.com/" },
  youtube:   { label: "YouTube",    domain: "https://www.youtube.com/@" },
  x:         { label: "X (Twitter)",domain: "https://x.com/" },
  tiktok:    { label: "TikTok",     domain: "https://www.tiktok.com/@" }
};

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
 * 1. SNS 채널 다중 입력
 * ========================================================= */
const snsList = $("#snsList");

function createSnsRow() {
  const row = document.createElement("div");
  row.className = "sns-row";

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
  });

  row.append(select, input, btnRemove);
  return row;
}

snsList.appendChild(createSnsRow()); // 기본 1행
$("#btnAddSns").addEventListener("click", () => {
  snsList.appendChild(createSnsRow());
  snsList.lastElementChild.querySelector("select").focus();
});

function collectSnsChannels() {
  const channels = [];
  $$("#snsList .sns-row").forEach((row) => {
    const key = row.querySelector("select").value;
    const url = row.querySelector("input").value.trim();
    if (key && url && url !== SNS_CHANNELS[key].domain) {
      channels.push({ channel: SNS_CHANNELS[key].label, url });
    }
  });
  return channels;
}

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
 * 4. 약관 동의 (전체 동의 + 개별 동의 + 버튼 활성화)
 * ========================================================= */
const agreeAll = $("#agreeAll");
const agreeItems = [...$$(".agree-item")];
const btnSubmit = $("#btnSubmit");

function refreshSubmitState() {
  const allChecked = agreeItems.every((c) => c.checked);
  agreeAll.checked = allChecked;
  btnSubmit.disabled = !allChecked; // 필수 약관 미동의 시 신청하기 비활성화
}

agreeAll.addEventListener("change", () => {
  agreeItems.forEach((c) => (c.checked = agreeAll.checked));
  refreshSubmitState();
});
agreeItems.forEach((c) => c.addEventListener("change", refreshSubmitState));
refreshSubmitState();

/* =========================================================
 * 5. 약관 '자세히 보기' 모달
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
 * 6. 입력 검증
 * ========================================================= */
function validateForm() {
  let ok = true;
  const focusTargets = [];

  const lfmallIdOk = $("#lfmallId").value.trim().length > 0;
  setFieldError("field-lfmallId", !lfmallIdOk);
  if (!lfmallIdOk) { ok = false; focusTargets.push($("#lfmallId")); }

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
["lfmallId", "email", "name", "nickname", "phone"].forEach((id) => {
  document.getElementById(id).addEventListener("input", () => setFieldError("field-" + id, false));
});
$("#categoryChips").addEventListener("change", () => setFieldError("field-category", false));
$("#snsList").addEventListener("input", () => setFieldError("field-sns", false));

/* =========================================================
 * 7. 제출 (Google Apps Script로 전송)
 * ========================================================= */
$("#applyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (btnSubmit.disabled) return;
  if (!validateForm()) return;

  const payload = {
    recipients: CONFIG.RECIPIENTS,
    lfmallId: $("#lfmallId").value.trim(),
    email: $("#email").value.trim(),
    name: $("#name").value.trim(),
    nickname: $("#nickname").value.trim(),
    categories: [...$$('input[name="category"]:checked')].map((c) => c.value),
    phone: $("#phone").value.trim(),
    bizStatus: getBizStatus(),
    snsChannels: collectSnsChannels(),
    submittedAt: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    attachments: []
  };

  for (const file of attachedFiles) {
    payload.attachments.push({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      base64: await fileToBase64(file)
    });
  }

  /* 데모 모드 : Apps Script URL 미설정 시 */
  if (!CONFIG.APPS_SCRIPT_URL) {
    console.log("[데모 모드] 전송 데이터 ▼");
    console.log(payload);
    showToast("데모 모드: 전송 데이터가 콘솔(F12)에 출력되었습니다.");
    finishSubmit();
    return;
  }

  const loading = $("#loadingOverlay");
  loading.classList.add("show");
  btnSubmit.disabled = true;

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
      throw new Error(
        (result && result.message) ||
        "전송 결과를 확인할 수 없습니다. Apps Script 배포 설정(액세스 권한: '모든 사용자')을 확인해 주세요."
      );
    }
    finishSubmit();
  } catch (err) {
    console.error(err);
    /* 원인 파악이 쉽도록 상세 사유를 함께 표시 */
    let detail = err && err.message ? err.message : "";
    if (err instanceof TypeError) {
      detail = "서버에 연결하지 못했습니다. URL이 /exec로 끝나는 웹앱 URL인지, " +
               "배포 액세스 권한이 '모든 사용자'인지 확인해 주세요.";
    }
    showToast("전송 중 오류가 발생했습니다. " + detail);
    btnSubmit.disabled = false;
  } finally {
    loading.classList.remove("show");
  }
});

function finishSubmit() {
  $("#formArea").style.display = "none";
  $("#completeArea").classList.add("show");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
