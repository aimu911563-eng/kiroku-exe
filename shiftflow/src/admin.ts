
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

const API_BASE = "https://shiftflow-api.aimu911563.workers.dev";

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
    ( $("empIdInput") as HTMLInputElement ).value = "";
    ( $("empNameInput") as HTMLInputElement ).value = "";
    ( $("empPinInput") as HTMLInputElement ).value = "";
    show($("employeeModalOverlay") as HTMLElement);
}

function closeEmployeeMadal() {
    hide($("employeeModalOverlay") as HTMLElement);
}


async function submitEmployee() {
    setModalError(null);

    const employee_id = normalizeDigits(( $("empIdInput") as HTMLInputElement ). value);
    const employee_name = ( $("empNameInput") as HTMLInputElement ).value.trim();
    const pin = normalizeDigits(( $("empPinInput") as HTMLInputElement ).value);

    if (employee_id.length !== 8) return setModalError("従業員番号は８桁で入力してね");
    if (!employee_name) return setModalError("氏名を入力してね");
    if (pin.length !== 4) return setModalError("PINは4桁で入力してね");

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return setModalError("管理者トークンがないよ。ログインし直してね");

    const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: {"Content-Type": "application/json", "Authorization": `Bearer ${token}`,},
        body: JSON.stringify({ employee_id, employee_name, pin }),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        return setModalError(`登録に失敗: ${res.status} ${text}`);
    }

    closeEmployeeMadal();

    //ここで一覧呼びたい時は呼ぶ
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





// 初期表示
wireEmployeeModal();
loadStoresToSelect();
setLoggedInUI(!!getToken());
