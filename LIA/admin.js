/* =========================================================
 * LFmall 인플루언서 신청 관리 ADMIN - admin.js
 * =========================================================
 * [설정] APPS_SCRIPT_URL : 신청 화면(app.js)과 동일한 웹앱 URL을 사용합니다.
 * 인증 토큰은 브라우저 메모리(sessionStorage)에만 보관되며 탭을 닫으면 사라집니다.
 * 서버 세션은 2시간 후 자동 만료됩니다.
 * ========================================================= */
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwVjfkUZPKJfF7Ma6AriDgkbMISNTH7qaCh_Os5TgLkF5hx7rYFNocDLmZl3LyEr1J6Ug/exec"
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let records = [];        // 신청 내역
let invites = [];        // 초대 내역 (전체)
let invitesView = [];    // 초대 내역 (검색 필터 적용)
let masked = true;       // 개인정보 마스킹 상태 (기본: 마스킹)
let pendingDelete = null; // { type: 'app' | 'inv', id }

/* 페이징 상태 (10/50/100) */
const paging = {
  app: { page: 1, size: 10 },
  inv: { page: 1, size: 10 }
};
function pageSlice(arr, p) {
  const totalPages = Math.max(1, Math.ceil(arr.length / p.size));
  if (p.page > totalPages) p.page = totalPages;
  if (p.page < 1) p.page = 1;
  const start = (p.page - 1) * p.size;
  return { rows: arr.slice(start, start + p.size), start, totalPages };
}

/* 인스타 초대 DM 설정 */
const DM_ACCOUNT = "lfmall_fashionclub";
const DM_MESSAGE = "안녕하세요 LFmall 입니다. 인플루언서 가입 신청 URL 전달드려요. (https://buycrown.cloud/lfapplyfor/) 신청 이후에는 담당자가 별도 연락드릴 예정입니다.";

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
    /* 세션 만료 시 로그인 화면으로 복귀 */
    if (String(result.message || "").indexOf("세션") !== -1) {
      sessionStorage.removeItem("lf_admin_token");
      showLogin();
    }
    throw new Error(result.message || "요청에 실패했습니다.");
  }
  return result;
}

/* ---------- 마스킹 (개인정보 표시 최소화) ---------- */
function maskName(v) {
  if (!v) return "-";
  if (v.length <= 1) return v;
  if (v.length === 2) return v[0] + "*";
  return v[0] + "*".repeat(v.length - 2) + v[v.length - 1];
}
function maskEmail(v) {
  if (!v || v.indexOf("@") === -1) return v || "-";
  const [id, domain] = v.split("@");
  const shown = id.slice(0, Math.min(2, id.length));
  return shown + "*".repeat(Math.max(1, id.length - shown.length)) + "@" + domain;
}
function maskPhone(v) {
  if (!v) return "-";
  return v.replace(/^(\d{3})-(\d{3,4})-(\d{4})$/, "$1-****-$3");
}
const disp = {
  name: (v) => (masked ? maskName(v) : v || "-"),
  email: (v) => (masked ? maskEmail(v) : v || "-"),
  phone: (v) => (masked ? maskPhone(v) : v || "-")
};

/* ---------- SNS 채널 아이콘 ---------- */
const SNS_ICONS = {
  instagram: '<svg viewBox="0 0 24 24"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16m0 3.68a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32m0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8m6.4-11.85a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0"/></svg>',
  youtube: '<svg viewBox="0 0 24 24"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.9 2.9 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.9 2.9 0 0 1 .88.13V9.4a6.33 6.33 0 0 0-.88-.05A6.34 6.34 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>'
};

function snsKeyOf(channel) {
  const c = (channel || "").toLowerCase();
  if (c.includes("insta")) return "instagram";
  if (c.includes("youtube")) return "youtube";
  if (c.includes("x") || c.includes("twitter")) return "x";
  if (c.includes("tiktok") || c.includes("틱톡")) return "tiktok";
  return "link";
}

/* snsText("Instagram: https://..." 줄 단위) → [{channel, url}] */
function parseSns(snsText) {
  return (snsText || "").split(/\r?\n/).map((line) => {
    const idx = line.indexOf(":");
    if (idx === -1) return null;
    const channel = line.slice(0, idx).trim();
    const url = line.slice(idx + 1).trim();
    if (!url || !/^https?:\/\//.test(url)) return null;
    return { channel, url };
  }).filter(Boolean);
}

function buildSnsIcons(snsText) {
  const wrap = document.createElement("span");
  wrap.className = "sns-icons";
  const channels = parseSns(snsText);
  if (!channels.length) { wrap.textContent = "-"; return wrap; }
  channels.forEach(({ channel, url }) => {
    const a = document.createElement("a");
    a.className = "sns-ico " + snsKeyOf(channel);
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.title = channel + " · " + url;      /* 마우스 오버 시 URL 표시 */
    a.setAttribute("aria-label", channel + " 채널 열기");
    a.innerHTML = SNS_ICONS[snsKeyOf(channel)];
    a.addEventListener("click", (e) => e.stopPropagation()); /* 행 클릭(상세)과 분리 */
    wrap.appendChild(a);
  });
  return wrap;
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
    await loadList();
    await loadInvites();
  } catch (err) {
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
  showToast(masked ? "개인정보가 마스킹 처리되었습니다." : "개인정보가 표시됩니다. 업무 목적 외 열람에 유의하세요.");
});

/* ---------- 목록 조회 / 검색 ---------- */
async function loadList() {
  setLoading(true, "목록을 불러오는 중…");
  try {
    const q = $("#searchInput").value.trim();
    const result = await api("list", { q, field: $("#searchField").value });
    records = result.records || [];
    paging.app.page = 1;
    renderList();
    if (!q) renderAppDashboard(); // 대시보드는 전체 기준 수치 유지
  } catch (err) {
    showToast(err.message);
  } finally {
    setLoading(false);
  }
}

function renderList() {
  const tbody = $("#listBody");
  tbody.innerHTML = "";
  $("#statTotal").innerHTML = "총 <b>" + records.length + "</b>건";
  $("#emptyMsg").style.display = records.length ? "none" : "";

  const { rows, start, totalPages } = pageSlice(records, paging.app);
  $("#appPageInfo").textContent = records.length
    ? (start + 1) + "–" + (start + rows.length) + " / " + records.length + "건 · " + paging.app.page + "/" + totalPages + " 페이지"
    : "0건";
  $("#appPrev").disabled = paging.app.page <= 1;
  $("#appNext").disabled = paging.app.page >= totalPages;

  rows.forEach((r, i) => {
    const gi = start + i; // 전체 기준 인덱스
    const tr = document.createElement("tr");

    /* No. (신청 순번: 오래된 신청이 1번) */
    const tdNo = document.createElement("td");
    tdNo.className = "no";
    tdNo.textContent = records.length - gi;
    tr.appendChild(tdNo);

    /* 신청일시 (년월일 시분초 전체 표시) */
    const tdDt = document.createElement("td");
    tdDt.className = "dt";
    tdDt.textContent = r.submittedAt || "-";
    tr.appendChild(tdDt);

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

    /* SNS 채널 아이콘 (호버: URL 툴팁 / 클릭: 채널 새 창) */
    const tdSns = document.createElement("td");
    tdSns.appendChild(buildSnsIcons(r.snsText));
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
}

/* ---------- 신청 내역 대시보드 (검색 없이 전체 조회일 때 갱신) ---------- */
function renderAppDashboard() {
  $("#tileAppTotal").innerHTML = records.length + "<small>명</small>";
  $("#tilePlas").innerHTML = records.filter((r) => r.plasInfo).length + "<small>건</small>";
  const counts = { instagram: 0, youtube: 0, x: 0, tiktok: 0 };
  records.forEach((r) => {
    const keys = new Set(parseSns(r.snsText).map((s) => snsKeyOf(s.channel)));
    keys.forEach((k) => { if (counts[k] !== undefined) counts[k]++; });
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
  $("#f-name").value = r.name || "";
  $("#f-nickname").value = r.nickname || "";
  $("#f-email").value = r.email || "";
  $("#f-phone").value = r.phone || "";
  $("#f-bizStatus").value = r.bizStatus || "";
  $("#f-categories").value = r.categories || "";
  $("#f-snsText").value = r.snsText || "";
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
  $("#metaInfo").textContent = r.id
    ? "신청일시: " + (r.submittedAt || "-") + (r.updatedAt ? " · 최근 수정: " + r.updatedAt : "")
    : "";
}

function openDetail(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  $("#modalTitle").textContent = "신청 상세 / 수정";
  $("#btnDelete").style.display = "";
  fillForm(r);
  openModal("#detailModal");
}

$("#btnAdd").addEventListener("click", () => {
  $("#modalTitle").textContent = "신청 추가 (관리자 등록)";
  $("#btnDelete").style.display = "none";
  fillForm({});
  openModal("#detailModal");
});

/* 저장 (추가 or 수정) */
$("#btnSave").addEventListener("click", async () => {
  const id = $("#f-id").value;
  const payload = {
    name: $("#f-name").value.trim(),
    nickname: $("#f-nickname").value.trim(),
    email: $("#f-email").value.trim(),
    phone: $("#f-phone").value.trim(),
    bizStatus: $("#f-bizStatus").value,
    categories: $("#f-categories").value.trim(),
    snsText: $("#f-snsText").value.trim(),
    plasInfo: $("#f-plasInfo").value.trim(),
    memo: $("#f-memo").value.trim()
  };
  if (!payload.nickname && !payload.name) { showToast("이름 또는 활동명을 입력해 주세요."); return; }
  setLoading(true, "저장 중…");
  try {
    if (id) await api("update", { id, ...payload });
    else await api("create", payload);
    closeModal("#detailModal");
    showToast("저장되었습니다.");
    await loadList();
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
      await loadList();
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
 * 좌측 앵커 메뉴: 신청 내역 ↔ 초대 내역 페이지 전환
 * ========================================================= */
function switchView(view) {
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $("#viewApplications").style.display = view === "applications" ? "" : "none";
  $("#viewInvites").style.display = view === "invites" ? "" : "none";
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

function openDmWindow(handle) {
  navigator.clipboard && navigator.clipboard.writeText(DM_MESSAGE).catch(() => {});
  window.open("https://ig.me/m/" + encodeURIComponent(handle), "_blank", "noopener");
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

    const tdDt = document.createElement("td");
    tdDt.className = "dt";
    tdDt.textContent = r.invitedAt || "-";
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
    dmBtn.title = "DM 문구 복사 + DM 창 열기 (발송 계정: @" + DM_ACCOUNT + ")";
    dmBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openDmWindow(r.insta);
      showToast("DM 문구가 복사되었습니다. 열린 DM 창에 붙여넣어 전송하세요.");
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
  setLoading(true, "초대 등록 중…");
  try {
    await api("inviteCreate", { insta: handle, memo: $("#inviteMemo").value.trim() });
    openDmWindow(handle);
    showToast("초대 기록 완료! DM 문구가 복사되었습니다. 열린 DM 창에 붙여넣어 전송하세요.");
    $("#inviteInsta").value = ""; $("#inviteMemo").value = "";
    await loadInvites();
  } catch (err) {
    showToast(err.message);
  } finally {
    setLoading(false);
  }
});
$("#inviteInsta").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btnInvite").click(); });

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

/* ---------- 초기화: 세션 토큰이 있으면 자동 진입 ---------- */
(async function init() {
  updateMaskButton();
  if (sessionStorage.getItem("lf_admin_token")) {
    showAdmin();
    try { await loadList(); await loadInvites(); }
    catch (e) { showLogin(); }
  } else {
    showLogin();
  }
})();
