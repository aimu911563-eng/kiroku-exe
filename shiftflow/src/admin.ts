
import { employeeIdLengthForNewRegistration, isEmployeeIdValidForNewRegistration } from "./employee-id";

const TOKEN_KEY = "shiftflow_admin_token";
console.log("admin.tsを読み込みできた：）", TOKEN_KEY);

const loginBox = document.getElementById("loginBox") as HTMLElement;
const adminBox = document.getElementById("adminBox") as HTMLElement;

const pwEl = document.getElementById("pw") as HTMLInputElement;
const loginBtn = document.getElementById("loginBtn") as HTMLButtonElement;
const loginMsg = document.getElementById("loginMsg") as HTMLElement;

const loadBtn = document.getElementById("loadBtn") as HTMLButtonElement;
const logoutBtn = document.getElementById("logoutBtn") as HTMLButtonElement;
const out = document.getElementById("out") as HTMLDivElement;
const storeEl = document.getElementById("store") as HTMLSelectElement;

const weekStartEl = document.getElementById("weekStart") as HTMLInputElement;
const loadSubsBtn = document.getElementById("loadSubmissionsBtn") as HTMLButtonElement;
const tableWrap = document.getElementById("tableWrap") as HTMLDivElement;
const detailModal = document.getElementById("detailModal") as HTMLDivElement;
const detailCloseBtn = document.getElementById("detailCloseBtn") as HTMLButtonElement;
const detailTitle = document.getElementById("detailTitle") as HTMLHeadingElement;
const detailBody = document.getElementById("detailBody") as HTMLDivElement;
//const commentWrap = document.getElementById("commentWrap") as HTMLDivElement | null;
//const commentBox = document.getElementById("commentBox") as HTMLDivElement | null;
const summaryLine = document.getElementById("summaryLine") as HTMLDivElement | null;

//const API_BASE = "";

function renderSummary(rows: Row[]) {
  if (!summaryLine) return;

  const counts = { not_submitted: 0, submitted: 0, updated: 0, other: 0 };
  for (const r of rows) {
    if (r.status === "not_submitted") counts.not_submitted++;
    else if (r.status === "submitted") counts.submitted++;
    else if (r.status === "updated") counts.updated++;
    else counts.other++;
  }

  const parts = [
    `未提出: <b>${counts.not_submitted}</b>`,
    `提出済: <b>${counts.submitted}</b>`,
    `更新済: <b>${counts.updated}</b>`,
  ];
  if (counts.other) parts.push(`その他: <b>${counts.other}</b>`);

  summaryLine.innerHTML = `合計: <b>${rows.length}</b> | ${parts.join(" | ")}`;
}


function openModal() {
  detailModal.style.display = "flex";
}
function closeModal() {
  detailModal.style.display = "none";
  detailBody.innerHTML = "";
}
detailCloseBtn.addEventListener("click", closeModal);
detailModal.addEventListener("click", (e) => {
  if (e.target === detailModal) closeModal(); // 背景クリックで閉じる
});

function renderComment( 
  wrap: HTMLDivElement | null,
  box: HTMLDivElement | null,
  comment: string | null,
) {
    if (!wrap || !box) return;

    const text = (comment ?? "").trim();
    if (text) {
        wrap.style.display = "block";
        box.textContent = text;
    } else {
        wrap.style.display = "none";
        box.textContent = "";
    }
}

//日時フォーマッタ（JST固定）
function formatJPDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const w = ["日","月","火","水","木","金","土"][d.getDay()];
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  return `${y}/${m}/${day}(${w}) ${hh}:${mm}`;
}

//今週の月曜日に合わせる

function normalizeToMondayISO(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(y, m - 1, d); // ローカル日付で作る

  const day = base.getDay(); // 0=日, 1=月
  const diff = (day === 0 ? -6 : 1 - day); // 月曜に寄せる
  base.setDate(base.getDate() + diff);

  const yy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");

  return `${yy}-${mm}-${dd}`; // ★これだけ返す
}


const STATUS_ORDER: Record<string, number> = {
    not_submitted: 0,
    submitted: 1,
    updated: 2,
};
function statusRank(status: string) {
    return STATUS_ORDER[status] ?? 99;
}

//ステータス色付け
function renderStatusBadge(status: string) {
  const map: Record<string, { label: string; color: string }> = {
    submitted: { label: "提出済", color: "#2e7d32" },
    updated: { label: "更新済 🔒", color: "#1565c0" },
    not_submitted: { label: "未提出", color: "#757575" },
  }

  const s = map[status] ?? { label: status, color: "#555" };

  return `
    <span style="
      display:inline-block;
      padding:2px 8px;
      border-radius:999px;
      font-size:12px;
      color:#fff;
      background:${s.color};
      white-space:nowrap;
    ">
      ${s.label}
    </span>
  `;
}

type Row = {
    employee_id: string;
    employee_name: string;
    status: string;
    submitted_at: string;
    updated_at: string;
    created_at: string;
    comment?: string | null;
};

//週開始
let isNormalizingWeek = false;

weekStartEl.addEventListener("change", () => {
  if (isNormalizingWeek) return;
  const picked = weekStartEl.value.trim();
  if (!picked) return;

  const mondayISO = normalizeToMondayISO(picked);
  if (mondayISO !== picked) {
    isNormalizingWeek = true;
    weekStartEl.value = mondayISO;
    isNormalizingWeek = false;
  }
});


function esc(s: string) {
    return s.replace(/[&<>"']/g, (c) => 
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]);
}

function renderTable(rows: Row[]) {
  const sorted = [...rows].sort((a, b) => {
    const d = statusRank(a.status) - statusRank(b.status);
    if (d !== 0) return d;
    // 同ランク内は従業員IDで安定ソート（見やすい）
    return a.employee_id.localeCompare(b.employee_id);
  });

  renderSummary(sorted);

  const html = `
  <div style="
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
  "> 
    <table style="
      min-width: 700px;
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    ">
      <thead>
        <tr>
          <th style="border:1px solid #ddd; padding:8px; width:120px;">従業員ID</th>
          <th style="border:1px solid #ddd; padding:8px; width:140px;">名前</th>
          <th style="border:1px solid #ddd; padding:8px; width:110px;">ステータス</th>
          <th style="border:1px solid #ddd; padding:8px; width:120px;">更新</th>
          <th style="border:1px solid #ddd; padding:8px; width:40px;"></th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map((r) => `
          <tr
            data-employee-id="${esc(r.employee_id)}"
            class="${r.status === "not_submitted" ? "is-not-submitted" : ""}"
            style="cursor:pointer;"
          >
            <td style="border:1px solid #ddd; padding:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${esc(r.employee_id)}
            </td>
            <td style="border:1px solid #ddd; padding:8px; overflow:hidden; text-overflow:ellipsis;">
              ${esc(r.employee_name)}
            </td>
            <td style="border:1px solid #ddd; padding:8px;">
              ${renderStatusBadge(r.status)}
            </td>
            <td style="border:1px solid #ddd; padding:8px; white-space:nowrap;">
              ${esc(formatJPDateTime(r.updated_at ?? r.submitted_at ?? ""))}
            </td>
            <td style="border: 1px solid #ddd;; padding: 8px; text-align: center; color: #999; font-size: 18px;">
              >
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>
  `;

  tableWrap.innerHTML = html;

  tableWrap.querySelectorAll("tr[data-employee-id]").forEach((tr) => {
    tr.addEventListener("click", async () => {
      const employeeId = (tr as HTMLElement).dataset.employeeId!;
      if (!employeeId) return;
      await openSubmissionDetail(employeeId);
    });
  });
}



//詳細とってoutにだす（試し）
async function openSubmissionDetail(employeeId: string) {
  const weekStart = weekStartEl.value.trim();
  if (!weekStart) return;

  const data = await api(
    `/api/admin/submission?week_start=${encodeURIComponent(weekStart)}&employee_id=${encodeURIComponent(employeeId)}`
  );

  const sub = data?.submission;
  if (!sub) {
    detailTitle.textContent = "提出詳細";
    detailBody.innerHTML = `<p>データが見つかりません</p>`;
    openModal();
    return;
  }

  // --- 追加：日付作るやつ ---
  const parseISODate = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1); // ローカル日付で作る（ズレ防止）
  };
  const mmdd = (dt: Date) => {
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${m}/${d}`;
  };

  const base = parseISODate(sub.week_start); // 月曜

  const days = [
    ["mon", "月"], ["tue", "火"], ["wed", "水"], ["thu", "木"],
    ["fri", "金"], ["sat", "土"], ["sun", "日"],
  ] as const;

  const rowsHtml = days.map(([k, label], idx) => {
    const dt = new Date(base);
    dt.setDate(base.getDate() + idx);
    const labelWithDate = `${label} (${mmdd(dt)})`;

    const v = (sub.data?.[k] ?? "").trim();
    return `
      <tr>
        <td style="border:1px solid #ddd; padding:8px; width:110px;">${esc(labelWithDate)}</td>
        <td style="border:1px solid #ddd; padding:8px;">${esc(v || "ー")}</td>
      </tr>
    `;
  }).join("");

  // 週の範囲も出す
  const end = new Date(base);
  end.setDate(base.getDate() + 6);

  detailTitle.textContent = `${esc(sub.employee_name)}（${esc(sub.employee_id)}）`;

  detailBody.innerHTML = `
    <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
      <div><b>店舗</b>: ${esc(sub.store_id)}</div>
      <div><b>週</b>: ${esc(sub.week_start)} (${mmdd(base)}〜${mmdd(end)})</div>
      <div><b>status</b>: ${renderStatusBadge(sub.status ?? "")}</div>
    </div>

    <table style="width:100%; border-collapse:collapse;">
      <thead>
        <tr>
          <th style="border:1px solid #ddd; padding:8px;">曜日</th>
          <th style="border:1px solid #ddd; padding:8px;">時間</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div id="commentWrap" style="display:none; margin-top: 12px;">
      <div style="display: flex; gap: 6px; algin-items: center; margin-bottom 4px;">
        <span aria-hidden="true">💬</span>
          <b>コメント</b>
        </div>
        <div id="commentBox" style="white-space: pre-wrap; border: 1px solid #ddd; padding: 8px; border-radius: 8px; font-size: 14px;"></div>
    </div>

    <div style="margin-top:12px; font-size:12px; color:#666;">
      提出された時: ${formatJPDateTime(sub.submitted_at)}<br/>
      更新された時: ${formatJPDateTime(sub.updated_at)}<br/>
      作成された時: ${formatJPDateTime(sub.created_at)}
    </div>
  `;

  const commentWrap = detailBody.querySelector("#commentWrap") as HTMLDivElement | null;
  const commentBox = detailBody.querySelector("#commentBox") as HTMLDivElement | null;


  renderComment(commentWrap, commentBox, sub.comment);
  openModal();
}

//新人登録モーダル

function $(id: string) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missng element: #${id}`);
    return el;
}

function show(el: HTMLElement) { el.classList.remove("hidden"); }
function hide(el: HTMLElement) { el.classList.add("hidden"); }

let modalScrollY = 0;
let modalLockCount = 0;

function lockPageScroll() {
  if (modalLockCount++ > 0) return;
  modalScrollY = window.scrollY;
  document.body.style.top = `-${modalScrollY}px`;
  document.body.classList.add("modalOpen");
}

function unlockPageScroll() {
  modalLockCount = Math.max(0, modalLockCount - 1);
  if (modalLockCount > 0) return;
  document.body.classList.remove("modalOpen");
  document.body.style.top = "";
  window.scrollTo(0, modalScrollY);
}

function normalizeDigits(v: string) {
    return (v ?? "").replace(/\D/g, "");
}

function setModalError(msg: string | null) {
    const el = $("employeeModalError") as HTMLElement;

    if (!msg) {
        el.textContent = "";
        el.classList.add("hidden");
        return;
    }

    el.textContent = msg;
    el.classList.remove("hidden");
}

function openEmployeeModal() {
    setModalError(null);
    const requiredLength = employeeIdLengthForNewRegistration(storeEl.value);
    const employeeIdInput = $("empIdInput") as HTMLInputElement;
    $("empIdLabel").textContent = `従業員番号（${requiredLength}桁）`;
    employeeIdInput.maxLength = requiredLength;
    employeeIdInput.placeholder = requiredLength === 9 ? "例：123456789" : "例：72490001";
    employeeIdInput.value = "";
    ( $("empNameInput") as HTMLInputElement ).value = "";
    ( $("empPinInput") as HTMLInputElement ).value = "";
    ( $("employeeCreateConfirmCheck") as HTMLInputElement ).checked = false;
    ( $("submitEmployeeModal") as HTMLButtonElement ).disabled = true;
    lockPageScroll();
    show($("employeeModalOverlay") as HTMLElement);
    requestAnimationFrame(() => ($("empIdInput") as HTMLInputElement).focus());
}

function closeEmployeeMadal() {
    hide($("employeeModalOverlay") as HTMLElement);
    unlockPageScroll();
}


async function submitEmployee() {
    setModalError(null);

    if (!(($("employeeCreateConfirmCheck") as HTMLInputElement).checked)) {
      return setModalError("入力内容を確認してチェックを入れてください");
    }

    const employee_id = normalizeDigits(( $("empIdInput") as HTMLInputElement ). value);
    const employee_name = ( $("empNameInput") as HTMLInputElement ).value.trim();
    const pin = normalizeDigits(( $("empPinInput") as HTMLInputElement ).value);

    const requiredLength = employeeIdLengthForNewRegistration(storeEl.value);
    if (!isEmployeeIdValidForNewRegistration(employee_id, storeEl.value)) {
      return setModalError(`従業員番号は${requiredLength}桁で入力してね`);
    }
    if (!employee_name) return setModalError("氏名を入力してね");
    if (pin.length !== 4) return setModalError("PINは4桁で入力してね");

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return setModalError("管理者トークンがないよ。ログインし直してね");

    const submitButton = $("submitEmployeeModal") as HTMLButtonElement;
    submitButton.disabled = true;
    submitButton.textContent = "登録中...";

    try {
      await api("/api/admin/employees", {
          method: "POST",
          body: JSON.stringify({ employee_id, employee_name, pin }),
      });
      closeEmployeeMadal();
      loginMsg.textContent = `${employee_name}さんを登録しました`;
      if (weekStartEl.value) loadSubsBtn.click();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "登録に失敗しました");
    } finally {
      submitButton.disabled = !(($("employeeCreateConfirmCheck") as HTMLInputElement).checked);
      submitButton.textContent = "登録する";
    }
}; 

function wireEmployeeModal() {
    $("openEmployeeModal").addEventListener("click", openEmployeeModal);
    $("closeEmployeeModal").addEventListener("click", closeEmployeeMadal);

    //クリックで閉じる
    $("employeeModalOverlay").addEventListener("click", (e) => {
        if (e.target === $("employeeModalOverlay")) closeEmployeeMadal();
    });

    $("submitEmployeeModal").addEventListener("click", async () => {
        console.log("submit clicked")
        await submitEmployee();
    });

    $("employeeCreateConfirmCheck").addEventListener("change", () => {
      const checked = ($("employeeCreateConfirmCheck") as HTMLInputElement).checked;
      ($("submitEmployeeModal") as HTMLButtonElement).disabled = !checked;
    });

    ["empIdInput", "empNameInput", "empPinInput"].forEach((id) => {
      $(id).addEventListener("input", () => {
        ($("employeeCreateConfirmCheck") as HTMLInputElement).checked = false;
        ($("submitEmployeeModal") as HTMLButtonElement).disabled = true;
      });
    });
}

type AdminEmployee = {
  employee_id: string;
  employee_name: string;
};

let deleteEmployees: AdminEmployee[] = [];

function setEmployeeDeleteError(message: string | null) {
  const element = $("employeeDeleteError");
  element.textContent = message ?? "";
  element.classList.toggle("hidden", !message);
}

function selectedEmployeeIds() {
  return Array.from(
    $("employeeDeleteList").querySelectorAll<HTMLInputElement>("input[type=checkbox]:checked"),
  ).map((checkbox) => checkbox.value);
}

function resetEmployeeDeleteConfirmation() {
  hide($("employeeDeleteConfirm"));
  hide($("submitEmployeeDelete"));
  show($("openEmployeeDeleteConfirm"));
  ($("employeeDeleteConfirmCheck") as HTMLInputElement).checked = false;
  ($("submitEmployeeDelete") as HTMLButtonElement).disabled = true;
}

function updateEmployeeDeleteSelection() {
  const selectedCount = selectedEmployeeIds().length;
  ($("openEmployeeDeleteConfirm") as HTMLButtonElement).disabled = selectedCount === 0;
  $("employeeDeleteCount").textContent = String(selectedCount);
  resetEmployeeDeleteConfirmation();
}

function renderEmployeeDeleteList() {
  const list = $("employeeDeleteList");
  const empty = $("employeeDeleteEmpty");
  list.innerHTML = "";

  if (deleteEmployees.length === 0) {
    hide(list);
    show(empty);
    return;
  }

  hide(empty);
  show(list);
  list.innerHTML = deleteEmployees.map((employee) => `
    <label class="employeeDeleteOption">
      <input type="checkbox" value="${esc(employee.employee_id)}">
      <span class="employeeDeleteIdentity">
        <span>${esc(employee.employee_name)}</span>
        <span class="employeeDeleteId">${esc(employee.employee_id)}</span>
      </span>
    </label>
  `).join("");

  list.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((checkbox) => {
    checkbox.addEventListener("change", updateEmployeeDeleteSelection);
  });
}

async function openEmployeeDeleteModal() {
  setEmployeeDeleteError(null);
  deleteEmployees = [];
  $("employeeDeleteList").innerHTML = "";
  show($("employeeDeleteLoading"));
  hide($("employeeDeleteList"));
  hide($("employeeDeleteEmpty"));
  ($("openEmployeeDeleteConfirm") as HTMLButtonElement).disabled = true;
  resetEmployeeDeleteConfirmation();
  lockPageScroll();
  show($("employeeDeleteModalOverlay"));

  try {
    const data = await api("/api/admin/employees");
    deleteEmployees = Array.isArray(data?.employees) ? data.employees : [];
    renderEmployeeDeleteList();
  } catch (error) {
    setEmployeeDeleteError(error instanceof Error ? error.message : "従業員一覧の取得に失敗しました");
  } finally {
    hide($("employeeDeleteLoading"));
  }
}

function closeEmployeeDeleteModal() {
  hide($("employeeDeleteModalOverlay"));
  unlockPageScroll();
}

async function submitEmployeeDelete() {
  const employee_ids = selectedEmployeeIds();
  if (employee_ids.length === 0) return;
  if (!(($("employeeDeleteConfirmCheck") as HTMLInputElement).checked)) {
    return setEmployeeDeleteError("削除対象と影響を確認してチェックを入れてください");
  }

  const submitButton = $("submitEmployeeDelete") as HTMLButtonElement;
  submitButton.disabled = true;
  setEmployeeDeleteError(null);

  try {
    const data = await api("/api/admin/employees", {
      method: "DELETE",
      body: JSON.stringify({ employee_ids }),
    });
    const deletedCount = Array.isArray(data?.deleted_employee_ids)
      ? data.deleted_employee_ids.length
      : 0;
    closeEmployeeDeleteModal();
    loginMsg.textContent = `${deletedCount}名を削除しました`;

    if (weekStartEl.value) loadSubsBtn.click();
  } catch (error) {
    setEmployeeDeleteError(error instanceof Error ? error.message : "削除に失敗しました");
  } finally {
    submitButton.disabled = !(($("employeeDeleteConfirmCheck") as HTMLInputElement).checked);
  }
}

function wireEmployeeDeleteModal() {
  $("openEmployeeDeleteModal").addEventListener("click", openEmployeeDeleteModal);
  $("closeEmployeeDeleteModal").addEventListener("click", closeEmployeeDeleteModal);
  $("employeeDeleteModalOverlay").addEventListener("click", (event) => {
    if (event.target === $("employeeDeleteModalOverlay")) closeEmployeeDeleteModal();
  });
  $("openEmployeeDeleteConfirm").addEventListener("click", () => {
    const selectedCount = selectedEmployeeIds().length;
    if (selectedCount === 0) return;
    $("employeeDeleteCount").textContent = String(selectedCount);
    show($("employeeDeleteConfirm"));
    hide($("openEmployeeDeleteConfirm"));
    show($("submitEmployeeDelete"));
  });
  $("employeeDeleteConfirmCheck").addEventListener("change", () => {
    const checked = ($("employeeDeleteConfirmCheck") as HTMLInputElement).checked;
    ($("submitEmployeeDelete") as HTMLButtonElement).disabled = !checked;
  });
  $("submitEmployeeDelete").addEventListener("click", submitEmployeeDelete);
}


function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setLoggedInUI(isLoggedIn: boolean) {
  loginBox.style.display = isLoggedIn ? "none" : "block";
  adminBox.style.display = isLoggedIn ? "block" : "none";
  loginMsg.textContent = "";
}

async function api(path: string, init: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(init.headers);

  if (token) headers.set("Authorization", `Bearer ${token}`);

  // body がある時だけ Content-Type を付ける（GETで付けても悪くないけど綺麗に）
  if (init.body) headers.set("Content-Type", "application/json");

  const res = await fetch(path, {
    ...init,
    headers,
  });

  const text = await res.text();

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }

  if (!res.ok) {
    throw new Error(data?.error ?? `HTTP ${res.status}`);
  }
  return data;
}

const announcementMessageEl = $("announcementMessage") as HTMLTextAreaElement;
const announcementActiveEl = $("announcementActive") as HTMLInputElement;
const announcementCountEl = $("announcementCount");
const announcementStatusEl = $("announcementMessageStatus");
const saveAnnouncementBtn = $("saveAnnouncement") as HTMLButtonElement;

function updateAnnouncementCount() {
  announcementCountEl.textContent = `${announcementMessageEl.value.length}/300`;
}

async function loadAnnouncement() {
  try {
    const data = await api("/api/admin/announcement");
    announcementMessageEl.value = data.announcement?.message ?? "";
    announcementActiveEl.checked = data.announcement?.is_active === true;
    announcementStatusEl.textContent = "";
    updateAnnouncementCount();
  } catch (error) {
    announcementStatusEl.textContent = error instanceof Error ? error.message : "お知らせを取得できませんでした";
  }
}

async function saveAnnouncement() {
  saveAnnouncementBtn.disabled = true;
  announcementStatusEl.textContent = "保存中…";
  try {
    await api("/api/admin/announcement", { method: "PUT", body: JSON.stringify({ message: announcementMessageEl.value, is_active: announcementActiveEl.checked }) });
    announcementStatusEl.textContent = announcementActiveEl.checked ? "従業員画面へ公開しました" : "非公開で保存しました";
  } catch (error) {
    announcementStatusEl.textContent = error instanceof Error ? error.message : "保存できませんでした";
  } finally { saveAnnouncementBtn.disabled = false; }
}

announcementMessageEl.addEventListener("input", updateAnnouncementCount);
saveAnnouncementBtn.addEventListener("click", saveAnnouncement);

const hoursFields = {
  weekdayOpen: $("weekdayOpen") as HTMLSelectElement,
  weekdayClose: $("weekdayClose") as HTMLSelectElement,
  weekendOpen: $("weekendOpen") as HTMLSelectElement,
  weekendClose: $("weekendClose") as HTMLSelectElement,
};

function fillHoursSelects() {
  const values: string[] = [];
  for (let minutes = 0; minutes <= 24 * 60; minutes += 15) {
    values.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  Object.values(hoursFields).forEach((select) => {
    select.innerHTML = values.map((value) => `<option value="${value}">${value}</option>`).join("");
  });
}

async function loadBusinessHours() {
  const message = $("businessHoursMessage");
  try {
    const data = await api("/api/admin/business-hours");
    hoursFields.weekdayOpen.value = data.hours.weekday.open;
    hoursFields.weekdayClose.value = data.hours.weekday.close;
    hoursFields.weekendOpen.value = data.hours.weekendHoliday.open;
    hoursFields.weekendClose.value = data.hours.weekendHoliday.close;
    message.textContent = "";
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "営業時間を取得できませんでした";
  }
}

function openBusinessHoursConfirm() {
  const checkbox = $("businessHoursConfirmCheck") as HTMLInputElement;
  const confirmButton = $("confirmBusinessHoursSave") as HTMLButtonElement;
  checkbox.checked = false;
  confirmButton.disabled = true;
  $("businessHoursConfirmSummary").innerHTML = `
    <div><span>店舗</span><strong>${esc(storeEl.options[storeEl.selectedIndex]?.textContent ?? storeEl.value)}</strong></div>
    <div><span>平日（月〜木）</span><strong>${esc(hoursFields.weekdayOpen.value)}〜${esc(hoursFields.weekdayClose.value)}</strong></div>
    <div><span>金・土・日・祝</span><strong>${esc(hoursFields.weekendOpen.value)}〜${esc(hoursFields.weekendClose.value)}</strong></div>
  `;
  lockPageScroll();
  show($("businessHoursConfirmOverlay") as HTMLElement);
  requestAnimationFrame(() => checkbox.focus());
}

function closeBusinessHoursConfirm() {
  hide($("businessHoursConfirmOverlay") as HTMLElement);
  unlockPageScroll();
}

async function saveBusinessHours() {
  const button = $("saveBusinessHours") as HTMLButtonElement;
  const confirmButton = $("confirmBusinessHoursSave") as HTMLButtonElement;
  const message = $("businessHoursMessage");
  button.disabled = true;
  confirmButton.disabled = true;
  confirmButton.textContent = "保存中...";
  message.textContent = "";
  try {
    await api("/api/admin/business-hours", {
      method: "PUT",
      body: JSON.stringify({
        hours: {
          weekday: { open: hoursFields.weekdayOpen.value, close: hoursFields.weekdayClose.value },
          weekendHoliday: { open: hoursFields.weekendOpen.value, close: hoursFields.weekendClose.value },
        },
      }),
    });
    closeBusinessHoursConfirm();
    message.textContent = "営業時間を保存しました";
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "営業時間を保存できませんでした";
  } finally {
    button.disabled = false;
    confirmButton.textContent = "確認して保存";
    confirmButton.disabled = !(($("businessHoursConfirmCheck") as HTMLInputElement).checked);
  }
}

fillHoursSelects();
$("saveBusinessHours").addEventListener("click", openBusinessHoursConfirm);
$("businessHoursConfirmCheck").addEventListener("change", () => {
  const checkbox = $("businessHoursConfirmCheck") as HTMLInputElement;
  ($("confirmBusinessHoursSave") as HTMLButtonElement).disabled = !checkbox.checked;
});
$("cancelBusinessHoursSave").addEventListener("click", closeBusinessHoursConfirm);
$("confirmBusinessHoursSave").addEventListener("click", saveBusinessHours);
$("businessHoursConfirmOverlay").addEventListener("click", (event) => {
  if (event.target === $("businessHoursConfirmOverlay")) closeBusinessHoursConfirm();
});

//店舗一覧を読み込んでselectを埋める
async function loadStoresToSelect() {
  const res = await fetch("/api/public/stores");
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    loginMsg.textContent = data?.error ?? "店舗一覧の取得に失敗しました";
    return;
  }

  storeEl.innerHTML = `<option value="">店舗を選択</option>`;
  for (const s of data.stores as Array<{ id: string; name: string }>) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.name} (${s.id})`;
    storeEl.appendChild(opt);
  }
}

//一覧取得
loadSubsBtn.addEventListener("click", async () => {
  const picked = weekStartEl.value.trim();
  if (!picked) {
    loginMsg.textContent = "週開始日を入力してください";
    return;
  }
  const weekStart = normalizeToMondayISO(picked);
  if (weekStart !== picked) weekStartEl.value = weekStart;

  try {
    loadSubsBtn.disabled = true;
    loginMsg.textContent = "";

    const data = await api(`/api/admin/submissions?week_start=${encodeURIComponent(weekStart)}`);
    const rows = (data?.rows ?? []) as Row[];

    renderTable(rows);
    out.textContent = ""; // デバッグJSONを消したいなら空に
    loginMsg.textContent = `取得: ${rows.length}件`;
  } catch (e: any) {
    loginMsg.textContent = e?.message ?? "取得失敗";
    out.textContent = e?.message ?? "取得失敗";
  } finally {
    loadSubsBtn.disabled = false;
  }
});

//サマリ
loadBtn.addEventListener("click", async () => {
  try {
    loadBtn.disabled = true;
    loginMsg.textContent = "";
    const data = await api("/api/admin/summary");
    out.textContent = JSON.stringify(data, null, 2);
    loginMsg.textContent = data?.message ?? "ok";
  } catch (e: any) {
    out.textContent = e?.message ?? "サマリ読み込み失敗";
    loginMsg.textContent = e?.message ?? "サマリ読み込み失敗";
  } finally {
    loadBtn.disabled = false;
  }
});

// ログイン
// iOS Safari対策：display切替直後はvalueが描画されないため再セット

function setWeekStartValue(ymd: string) {
  weekStartEl.value = ymd;
  weekStartEl.setAttribute("value", ymd);

  // iOS Safari 対策：次フレームで再セット
  requestAnimationFrame(() => {
    weekStartEl.value = ymd;
    weekStartEl.setAttribute("value", ymd);
  });
}

loginBtn.addEventListener("click", async () => {
  const password = pwEl.value.trim();
  const store_id = storeEl.value;

  if (!store_id) {
    loginMsg.textContent = "店舗を選択してください";
    return;
  }
  if (!password) {
    loginMsg.textContent = "パスワード入れてください";
    return;
  }

  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, store_id }),
    });

    const data = await res.json().catch(() => ({} as any));
    const token = data?.token;

    if (!res.ok || !data?.ok || !token) {
        loginMsg.textContent = data?.error ?? "token取得失敗";
        return;
    }

    localStorage.setItem(TOKEN_KEY, token);
    setLoggedInUI(true);
    await loadBusinessHours();
    await loadAnnouncement();
    const mondayISO = normalizeToMondayISO(new Date().toISOString().slice(0, 10));
    setWeekStartValue(mondayISO)

    loginMsg.textContent = "";
  } catch {
    loginMsg.textContent = "通信エラーです";
  }
});

// ログアウト
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  pwEl.value = "";
  out.textContent = "";
  loginMsg.textContent = "";
  setLoggedInUI(false);
});

type PlannerAssignment = { start: string; end: string };
type PlannerAssignments = Record<string, Record<string, PlannerAssignment>>;
type PlannerEmployee = { employee_id: string; employee_name: string };
type PlannerSubmission = PlannerEmployee & { data: Record<string, string> };

const PLANNER_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const PLANNER_LABELS: Record<string, string> = { mon: "月", tue: "火", wed: "水", thu: "木", fri: "金", sat: "土", sun: "日" };
let plannerAssignments: PlannerAssignments = {};
let plannerEmployees: PlannerEmployee[] = [];
let plannerHolidayDays = new Map<string, string>();
let selectedChartDay = "mon";

function plannerMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function plannerTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function plannerDayDate(dayKey: string) {
  const [year, month, day] = weekStartEl.value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + PLANNER_DAYS.indexOf(dayKey as typeof PLANNER_DAYS[number]));
  return {
    iso: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    label: `${date.getMonth() + 1}/${date.getDate()}`,
  };
}

function plannerBounds(dayKey: string) {
  const date = plannerDayDate(dayKey);
  const weekend = ["fri", "sat", "sun"].includes(dayKey) || plannerHolidayDays.has(date.iso);
  const openValue = weekend ? hoursFields.weekendOpen.value : hoursFields.weekdayOpen.value;
  const closeValue = weekend ? hoursFields.weekendClose.value : hoursFields.weekdayClose.value;
  return {
    open: plannerMinutes(openValue),
    close: Math.min(plannerMinutes(closeValue) + 60, 24 * 60 + 30),
  };
}

function plannerRequiredStaff(dayKey: string) {
  const date = plannerDayDate(dayKey);
  const weekendHoliday = ["fri", "sat", "sun"].includes(dayKey) || plannerHolidayDays.has(date.iso);
  const input = $(weekendHoliday ? "requiredStaffWeekend" : "requiredStaffWeekday") as HTMLInputElement;
  return Math.max(1, Math.min(20, Number(input.value) || 1));
}

function plannerOptions(dayKey: string, selected: string, kind: "start" | "end") {
  const bounds = plannerBounds(dayKey);
  const first = kind === "start" ? bounds.open : bounds.open + 15;
  const last = kind === "start" ? bounds.close - 15 : bounds.close;
  const options: string[] = [];
  for (let minutes = first; minutes <= last; minutes += 15) options.push(plannerTime(minutes));
  return options.map((value) => `<option value="${value}"${value === selected ? " selected" : ""}>${value}</option>`).join("");
}

function derivePlannerAssignments(submissions: PlannerSubmission[]) {
  const result: PlannerAssignments = Object.fromEntries(PLANNER_DAYS.map((day) => [day, {}]));
  submissions.forEach((submission) => {
    PLANNER_DAYS.forEach((day) => {
      const match = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(String(submission.data?.[day] ?? ""));
      if (match) result[day][submission.employee_id] = { start: match[1], end: match[2] };
    });
  });
  return result;
}

function employeeName(employeeId: string) {
  return plannerEmployees.find((employee) => employee.employee_id === employeeId)?.employee_name ?? employeeId;
}

function renderHeatmap() {
  const globalStart = Math.min(...PLANNER_DAYS.map((day) => plannerBounds(day).open));
  const globalEnd = Math.max(...PLANNER_DAYS.map((day) => plannerBounds(day).close));
  const slots: number[] = [];
  for (let value = globalStart; value < globalEnd; value += 15) slots.push(value);

  const header = slots.map((slot) => `<th>${slot % 60 === 0 ? plannerTime(slot) : ""}</th>`).join("");
  const rows = PLANNER_DAYS.map((day) => {
    const bounds = plannerBounds(day);
    const required = plannerRequiredStaff(day);
    const cells = slots.map((slot) => {
      if (slot < bounds.open || slot >= bounds.close) return `<td class="heatOff"></td>`;
      const count = Object.values(plannerAssignments[day] ?? {}).filter((assignment) => {
        return plannerMinutes(assignment.start) <= slot && plannerMinutes(assignment.end) > slot;
      }).length;
      const level = count < required ? "heatLow" : count === required ? "heatOk" : "heatHigh";
      return `<td class="${level}" title="${PLANNER_LABELS[day]} ${plannerTime(slot)}：${count}名">${count}</td>`;
    }).join("");
    return `<tr><th>${PLANNER_LABELS[day]}</th>${cells}</tr>`;
  }).join("");
  $("heatmapWrap").innerHTML = `<table class="heatmapTable"><thead><tr><th></th>${header}</tr></thead><tbody>${rows}</tbody></table>`;
  renderStaffingWarnings();
  renderStaffingChart();
}

function staffingCount(day: string, slot: number) {
  return Object.values(plannerAssignments[day] ?? {}).filter((assignment) => {
    return plannerMinutes(assignment.start) <= slot && plannerMinutes(assignment.end) > slot;
  }).length;
}

function renderStaffingChart() {
  const tabs = $("staffingChartDays");
  tabs.innerHTML = PLANNER_DAYS.map((day) => {
    const date = plannerDayDate(day);
    const holiday = plannerHolidayDays.has(date.iso);
    return `<button type="button" data-chart-day="${day}" class="${day === selectedChartDay ? "active" : ""} ${day === "sat" ? "sat" : ""} ${day === "sun" || holiday ? "holiday" : ""}">${PLANNER_LABELS[day]}<small>${date.label}</small></button>`;
  }).join("");
  tabs.querySelectorAll<HTMLButtonElement>("[data-chart-day]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedChartDay = button.dataset.chartDay ?? "mon";
      renderStaffingChart();
    });
  });

  const day = selectedChartDay;
  const bounds = plannerBounds(day);
  const required = plannerRequiredStaff(day);
  const slots: number[] = [];
  for (let slot = bounds.open; slot < bounds.close; slot += 15) slots.push(slot);
  const counts = slots.map((slot) => staffingCount(day, slot));
  const maximum = Math.max(required + 1, ...counts, 1);
  const chartHeight = 180;
  const requiredBottom = Math.round((required / maximum) * chartHeight);
  const bars = slots.map((slot, index) => {
    const count = counts[index];
    const height = Math.max(count ? 8 : 2, Math.round((count / maximum) * chartHeight));
    const level = count < required ? "shortage" : count === required ? "enough" : "surplus";
    const label = slot % 60 === 0 ? plannerTime(slot) : "";
    return `<div class="staffingBarSlot" title="${plannerTime(slot)}：${count}名（必要${required}名）">
      <span class="staffingBarValue">${count}</span>
      <span class="staffingBar ${level}" style="height:${height}px"></span>
      <span class="staffingBarTime">${label}</span>
    </div>`;
  }).join("");
  const shortageSlots = counts.filter((count) => count < required).length;
  $("staffingChart").innerHTML = `
    <div class="staffingChartSummary">
      <strong>${PLANNER_LABELS[day]}曜日</strong>
      <span>必要 ${required}名</span>
      <span class="${shortageSlots ? "hasShortage" : "noShortage"}">${shortageSlots ? `不足 ${shortageSlots * 15}分` : "不足なし"}</span>
    </div>
    <div class="staffingPlot" style="--required-bottom:${requiredBottom}px; --chart-height:${chartHeight}px">
      <div class="staffingRequiredLine"><span>必要${required}名</span></div>
      <div class="staffingBars">${bars}</div>
    </div>`;
}

function renderStaffingWarnings() {
  const warnings: string[] = [];
  PLANNER_DAYS.forEach((day) => {
    const bounds = plannerBounds(day);
    const required = plannerRequiredStaff(day);
    let shortageStart: number | null = null;
    let lowest = required;
    for (let slot = bounds.open; slot <= bounds.close; slot += 15) {
      const count = slot === bounds.close ? required : Object.values(plannerAssignments[day] ?? {}).filter((assignment) => {
        return plannerMinutes(assignment.start) <= slot && plannerMinutes(assignment.end) > slot;
      }).length;
      if (count < required) {
        shortageStart ??= slot;
        lowest = Math.min(lowest, count);
      } else if (shortageStart !== null) {
        warnings.push(`${PLANNER_LABELS[day]} ${plannerTime(shortageStart)}〜${plannerTime(slot)}：最大${required - lowest}名不足`);
        shortageStart = null;
        lowest = required;
      }
    }
  });
  $("staffingWarnings").innerHTML = warnings.length
    ? warnings.map((warning) => `<span>${esc(warning)}</span>`).join("")
    : `<span class="staffingOk">必要人数を満たしています</span>`;
}

function movePlannerCard(employeeId: string, fromDay: string, toDay: string) {
  if (fromDay === toDay) return;
  const assignment = plannerAssignments[fromDay]?.[employeeId];
  if (!assignment) return;
  const bounds = plannerBounds(toDay);
  const duration = plannerMinutes(assignment.end) - plannerMinutes(assignment.start);
  const start = Math.max(bounds.open, Math.min(plannerMinutes(assignment.start), bounds.close - 15));
  const end = Math.min(bounds.close, Math.max(start + 15, start + duration));
  plannerAssignments[toDay] ??= {};
  plannerAssignments[toDay][employeeId] = { start: plannerTime(Math.max(bounds.open, end - duration)), end: plannerTime(end) };
  delete plannerAssignments[fromDay][employeeId];
  renderPlannerBoard();
  renderHeatmap();
}

function renderPlannerBoard() {
  const dayOptions = (selected: string) => PLANNER_DAYS.map((day) => `<option value="${day}"${day === selected ? " selected" : ""}>${PLANNER_LABELS[day]}</option>`).join("");
  $("plannerBoard").innerHTML = PLANNER_DAYS.map((day) => {
    const date = plannerDayDate(day);
    const holiday = plannerHolidayDays.get(date.iso);
    const cards = Object.entries(plannerAssignments[day] ?? {}).map(([employeeId, assignment]) => `
      <article class="plannerEmployeeCard" draggable="true" data-employee-id="${esc(employeeId)}" data-day="${day}">
        <div class="plannerEmployeeTop"><strong>${esc(employeeName(employeeId))}</strong><button type="button" class="plannerRemove" aria-label="勤務表から外す">×</button></div>
        <small>${esc(employeeId)}</small>
        <select class="plannerDaySelect" aria-label="曜日">${dayOptions(day)}</select>
        <div class="plannerTimeRow">
          <select data-planner-kind="start">${plannerOptions(day, assignment.start, "start")}</select>
          <span>〜</span>
          <select data-planner-kind="end">${plannerOptions(day, assignment.end, "end")}</select>
        </div>
      </article>
    `).join("");
    return `<section class="plannerDayColumn" data-drop-day="${day}"><header><strong>${PLANNER_LABELS[day]} ${date.label}</strong>${holiday ? `<small>${esc(holiday)}</small>` : ""}</header><div class="plannerDayCards">${cards || `<p>勤務なし</p>`}</div></section>`;
  }).join("");

  document.querySelectorAll<HTMLElement>(".plannerEmployeeCard").forEach((card) => {
    const employeeId = card.dataset.employeeId!;
    const day = card.dataset.day!;
    card.addEventListener("dragstart", (event) => event.dataTransfer?.setData("text/plain", `${day}:${employeeId}`));
    card.querySelector<HTMLSelectElement>(".plannerDaySelect")?.addEventListener("change", (event) => movePlannerCard(employeeId, day, (event.target as HTMLSelectElement).value));
    card.querySelectorAll<HTMLSelectElement>("[data-planner-kind]").forEach((select) => select.addEventListener("change", () => {
      const assignment = plannerAssignments[day][employeeId];
      const kind = select.dataset.plannerKind as "start" | "end";
      assignment[kind] = select.value;
      if (plannerMinutes(assignment.start) >= plannerMinutes(assignment.end)) {
        assignment.end = plannerTime(Math.min(plannerMinutes(assignment.start) + 15, plannerBounds(day).close));
      }
      renderPlannerBoard();
      renderHeatmap();
    }));
    card.querySelector(".plannerRemove")?.addEventListener("click", () => {
      delete plannerAssignments[day][employeeId];
      renderPlannerBoard();
      renderHeatmap();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-drop-day]").forEach((column) => {
    column.addEventListener("dragover", (event) => { event.preventDefault(); column.classList.add("dragOver"); });
    column.addEventListener("dragleave", () => column.classList.remove("dragOver"));
    column.addEventListener("drop", (event) => {
      event.preventDefault();
      column.classList.remove("dragOver");
      const [fromDay, employeeId] = (event.dataTransfer?.getData("text/plain") ?? "").split(":");
      if (fromDay && employeeId) movePlannerCard(employeeId, fromDay, column.dataset.dropDay!);
    });
  });
}

async function loadPlanner() {
  if (!weekStartEl.value) return;
  const message = $("plannerMessage");
  message.textContent = "読み込み中...";
  try {
    const data = await api(`/api/admin/planner?week_start=${encodeURIComponent(weekStartEl.value)}`);
    plannerEmployees = data.employees ?? [];
    plannerHolidayDays = new Map((data.holidays ?? []).map((holiday: { date: string; name: string }) => [holiday.date, holiday.name]));
    plannerAssignments = data.schedule?.assignments ?? derivePlannerAssignments(data.submissions ?? []);
    PLANNER_DAYS.forEach((day) => plannerAssignments[day] ??= {});
    ($("requiredStaffWeekday") as HTMLInputElement).value = String(data.schedule?.required_staff_weekday ?? data.schedule?.required_staff ?? 2);
    ($("requiredStaffWeekend") as HTMLInputElement).value = String(data.schedule?.required_staff_weekend_holiday ?? data.schedule?.required_staff ?? 2);
    const publishState = $("plannerPublishState");
    publishState.textContent = data.schedule?.published_at ? "公開済み" : "未公開";
    publishState.classList.toggle("isPublished", Boolean(data.schedule?.published_at));
    hide($("plannerEmpty"));
    show($("plannerContent"));
    renderPlannerBoard();
    renderHeatmap();
    message.textContent = data.schedule ? "保存済みの勤務表を読み込みました" : "提出希望から勤務表案を作成しました";
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "分析に失敗しました";
  }
}

async function savePlanner() {
  const button = $("savePlanner") as HTMLButtonElement;
  const message = $("plannerMessage");
  button.disabled = true;
  try {
    await api("/api/admin/planner", {
      method: "PUT",
      body: JSON.stringify({
        week_start: weekStartEl.value,
        staffing_requirements: {
          weekday: Number(($('requiredStaffWeekday') as HTMLInputElement).value),
          weekendHoliday: Number(($('requiredStaffWeekend') as HTMLInputElement).value),
        },
        assignments: plannerAssignments,
      }),
    });
    $("plannerPublishState").textContent = "未公開";
    $("plannerPublishState").classList.remove("isPublished");
    message.textContent = "内部用のシフト案を保存しました";
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "シフト案を保存できませんでした";
  } finally {
    button.disabled = false;
  }
}

async function publishPlanner() {
  const button = $("publishPlanner") as HTMLButtonElement;
  const message = $("plannerMessage");
  button.disabled = true;
  try {
    await api("/api/admin/planner/publish", {
      method: "POST",
      body: JSON.stringify({ week_start: weekStartEl.value }),
    });
    $("plannerPublishState").textContent = "公開済み";
    $("plannerPublishState").classList.add("isPublished");
    message.textContent = "従業員カレンダーへ公開しました";
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "公開できませんでした";
  } finally {
    button.disabled = false;
  }
}

$("loadPlanner").addEventListener("click", loadPlanner);
$("savePlanner").addEventListener("click", savePlanner);
$("publishPlanner").addEventListener("click", publishPlanner);
$("requiredStaffWeekday").addEventListener("input", renderHeatmap);
$("requiredStaffWeekend").addEventListener("input", renderHeatmap);





// 初期表示
wireEmployeeModal();
wireEmployeeDeleteModal();
loadStoresToSelect();
const hasAdminToken = !!getToken();
setLoggedInUI(hasAdminToken);
if (hasAdminToken) { loadBusinessHours(); loadAnnouncement(); }
