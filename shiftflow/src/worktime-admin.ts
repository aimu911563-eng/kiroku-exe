
type SubmissionStatus = "submitted" | "updated";

type WorktimeDashboard = {
  week_start: string; // "YYYY-MM-DD" (Mon)
  summary: { total: number; missing: number; submitted: number; updated: number };
  employees: { employee_id: string; name: string; is_active: boolean }[];
  submissions: {
    employee_id: string;
    status: SubmissionStatus;
    total_minutes: number;
    submitted_at: string;
    updated_at: string;
  }[];
};

type MonthlySummary = {
    month: string;
    rows: { 
        employee_id: string; 
        name: string; 
        total_minutes: number; 
        submitted_weeks: number;
        target_minutes: number; 
    }[];
};

type LeaveAdminSummaryResponse = {
  ok: true;
  as_of: string;
  rows: Array<{
    employee_id: string;
    name: string;
    remaining_days: number;
    base_grant_date: string | null;
    last_updated_at: string | null;
    last_request: null | {
      date: string;        // YYYY-MM-DD
      days: number;        // v0.1は 1
      status: string;      // approved/pending/rejected/canceled
      submitted_at: string;// ISO
    };
  }>;
};


// ====== CONFIG ======
const TOKEN_KEY = "worktime_admin_token";

// ====== DOM ======
const loginView = document.getElementById("loginView")!;
const dashView = document.getElementById("dashView")!;

const loginForm = document.getElementById("loginForm") as HTMLFormElement;
const adminPasswordEl = document.getElementById("adminPassword") as HTMLInputElement;
const loginErrorEl = document.getElementById("loginError")!;

const weekStartEl = document.getElementById("weekStart") as HTMLInputElement;
const csvBtn = document.getElementById("csvBtn") as HTMLButtonElement;
const logoutBtn = document.getElementById("logoutBtn") as HTMLButtonElement;
const remainBtn = document.getElementById("remainBtn") as HTMLButtonElement

const kpiMissing = document.getElementById("kpiMissing")!;
const kpiSubmitted = document.getElementById("kpiSubmitted")!;
const kpiUpdated = document.getElementById("kpiUpdated")!;

const statusMeta = document.getElementById("statusMeta")!;
const statusList = document.getElementById("statusList")!;

const rankingList = document.getElementById("rankingList")!;
const rankingMeta = document.getElementById("rankingMeta")!;

const leaveMeta = document.getElementById("leaveMeta")!;
const leaveBalanceList = document.getElementById("leaveBalanceList")!;
const leaveRecentList = document.getElementById("leaveRecentList")!;

const forecastMeta = document.getElementById("forecastMeta") as HTMLDivElement;
const forecastList = document.getElementById("forecastList") as HTMLDivElement;


// detail modal
const detailModal = document.getElementById("detailModal") as HTMLDialogElement;
const detailCloseBtn = document.getElementById("detailCloseBtn") as HTMLButtonElement;
const detailTitle = document.getElementById("detailTitle")!;
const detailSub = document.getElementById("detailSub")!;
const detailDays = document.getElementById("detailDays")!;
const detailTotal = document.getElementById("detailTotal")!;
const detailCommentRow = document.getElementById("detailCommentRow")!;
const detailComment = document.getElementById("detailComment")!;
const monthMeta = document.getElementById("monthMeta")!;
const monthBars = document.getElementById("monthBars")!;

// ====== STATE ======
let currentDashboard: WorktimeDashboard | null = null;

// ====== HELPERS ======
function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function show(el: Element) {
  el.classList.remove("hidden");
}
function hide(el: Element) {
  el.classList.add("hidden");
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

// week_start: Monday ISO, local-safe
function normalizeToMonday(dateStr: string): string {
  // Treat dateStr as local date
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // Sun=0 ... Sat=6
  const diffToMon = (day + 6) % 7; // Mon->0, Tue->1 ... Sun->6
  d.setDate(d.getDate() - diffToMon);
  return toYmd(d);
}

function getThisWeekMonday(): string {
  const now = new Date();
  return normalizeToMonday(toYmd(now));
}

function minutesToHHMM(mins: number): string {
  const m = Math.max(0, Math.floor(mins));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${hh}:${pad2(mm)}`;
}

//　y が不明
function ymdToMd(ymd: string): string {
  // "YYYY-MM-DD" -> "M/D"
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}/${m}/${d}`;
}

function monthFromWeekStart(weekStart: string): string {
  // For leave summary, use the month of weekStart (good enough for dashboard)
  const [y, m] = weekStart.split("-").map(Number);
  return `${y}-${pad2(m)}`;
}

async function apiGet<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${text}`.trim());
  }
  return (await res.json()) as T;
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${text}`.trim());
  }
  return (await res.json()) as T;
}

// ====== LOGIN ======
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hide(loginErrorEl);

  const password = adminPasswordEl.value.trim();
  if (!password) return;

  const btn = document.getElementById("loginBtn") as HTMLButtonElement;
  btn.disabled = true;

  try {
    const data = await apiPost<{ ok: boolean; token?: string; error?: string }>(
      "/api/worktime/admin/login",
      { password }
    );

    if (!data.ok || !data.token) {
      throw new Error(data.error || "login failed");
    }

    setToken(data.token);
    await boot();
  } catch {
    loginErrorEl.textContent = "ログインに失敗しました（パスワードを確認）";
    show(loginErrorEl);
  } finally {
    btn.disabled = false;
  }
});

logoutBtn.addEventListener("click", () => {
  clearToken();
  currentDashboard = null;
  show(loginView);
  hide(dashView);
});

function prevMonday(ymd: string): string {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() - 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ====== DASHBOARD FLOW ======
async function boot() {
  const token = getToken();
  if (!token) {
    show(loginView);
    hide(dashView);
    return;
  }

  hide(loginView);
  show(dashView);

  // init week
  const monday = getThisWeekMonday();
  weekStartEl.value = monday;

  // load
  await reloadAll();

  // listeners
  weekStartEl.addEventListener("change", async () => {
    const normalized = normalizeToMonday(weekStartEl.value);
    weekStartEl.value = normalized;
    await reloadAll();
  });

  csvBtn.addEventListener("click", async () => {
    const ws = weekStartEl.value;
    // CSVはダウンロードでOK（APIがtext/csvを返す想定）
    const token2 = getToken();
    const res = await fetch(`/api/worktime/admin/csv?week_start=${encodeURIComponent(ws)}`, {
      headers: token2 ? { Authorization: `Bearer ${token2}` } : {},
    });
    if (!res.ok) {
      alert("CSV取得に失敗しました");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `worktime_${ws}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

//今月合計描画
function renderMonthly(m: MonthlySummary) {
  monthMeta.textContent = `${m.month} / 所定労働時間は社員ごと（未提出週は含まれません）/ 緑のバー深夜（22時以降）です。`;

  monthBars.innerHTML = "";

  if (!m.rows?.length) {
    monthBars.innerHTML = `<div class="muted small">社員データがありません</div>`;
    return;
  }

  for (const r of m.rows) {
    const max = Number(r.target_minutes ?? 0) || 0;
    const total = Number(r.total_minutes ?? 0) || 0;
    const night = Number((r as any).night_minutes ?? 0) || 0;

    const pct =
      max <= 0 ? 0 : Math.min(100, Math.round((total / max) * 100));

    const nightPctInTotal =
      total <= 0 ? 0 : Math.min(100, Math.round((Math.min(night, total) / total) * 100));

    const el = document.createElement("div");
    el.className = "monthRow";
    el.innerHTML = `
      <div class="monthName">
        ${escapeHtml(r.name)}
        <span class="muted small">（目標 ${minutesToHHMM(max)}）</span>
      </div>
      <div class="monthBarWrap">
        <div class="monthBar" style="width:${pct}%">
          <div class="monthNightBar" style="width:${nightPctInTotal}%"></div>
        </div>
      </div>
      <div class="monthVal">
        ${minutesToHHMM(total)}
        <span class="muted small">(${pct}%)</span>
        <span class="muted small" style="margin-left: 8px;">深夜 ${minutesToHHMM(Math.min(night, total))}</span>
      </div>
    `;

    monthBars.appendChild(el);
  }
}


async function reloadAll() {
  const uiWeek = weekStartEl.value;
  const submiWeek = prevMonday(uiWeek);

  // 1) worktime dashboard
  const dash = await apiGet<WorktimeDashboard>(
    `/api/worktime/admin/dashboard?week_start=${encodeURIComponent(submiWeek)}`
  );
  currentDashboard = dash;
  renderDashboard(dash);

  // 2) leave summary (month)
  try {
    const leave = await apiGet<LeaveAdminSummaryResponse>(`/api/leave/admin/summary`);
    renderLeave(leave);
  } catch {
    // leave　API がなくても壊れないように
    leaveMeta.textContent = "有給API未接続";
    leaveBalanceList.innerHTML = `<div class="muted small">/api/leave/admin/summary を実装すると表示されます</div>`;
    leaveRecentList.innerHTML = "";
  }


  const month2 = monthFromWeekStart(uiWeek);
  const monthly = await apiGet<MonthlySummary>(
    `/api/worktime/admin/monthly?month=${encodeURIComponent(month2)}`
  );

  renderMonthly(monthly);
  renderForecast(monthly,uiWeek);
}

function renderDashboard(d: WorktimeDashboard) {
  currentDashboard = d;

  // KPI
  kpiMissing.textContent = `未提出: ${d.summary.missing}`;
  kpiSubmitted.textContent = `提出: ${d.summary.submitted}`;
  kpiUpdated.textContent = `更新: ${d.summary.updated}`;

  statusMeta.textContent = `${ymdToMd(d.week_start)}週 / 全${d.summary.total}名`;
  rankingMeta.textContent = `${ymdToMd(d.week_start)}週`;

  // build submission map
  const subMap = new Map<string, WorktimeDashboard["submissions"][number]>();
  for (const s of d.submissions) subMap.set(s.employee_id, s);

  // max total for bar scaling (only those with submissions)
  const totals = d.employees
    .filter((e) => e.is_active)
    .map((e) => subMap.get(e.employee_id)?.total_minutes ?? 0);
  const maxTotal = Math.max(0, ...totals);

  // status list (sorted)
  const rows = d.employees
    .filter((e) => e.is_active)
    .map((e) => {
      const s = subMap.get(e.employee_id);
      const status: "missing" | SubmissionStatus = s ? s.status : "missing";
      const totalMin = s ? s.total_minutes : 0;
      return { e, s, status, totalMin };
    })
    .sort((a, b) => {
      const order = (x: string) => (x === "missing" ? 0 : x === "submitted" ? 1 : 2);
      const od = order(a.status) - order(b.status);
      if (od !== 0) return od;
      return a.e.name.localeCompare(b.e.name, "ja");
    });

  statusList.innerHTML = "";
  for (const r of rows) {
    const barPct = maxTotal === 0 ? 0 : Math.round((r.totalMin / maxTotal) * 100);
    const totalLabel = r.status === "missing" ? "—" : minutesToHHMM(r.totalMin);

    const row = document.createElement("div");
    row.className = `row ${r.status === "missing" ? "missing" : ""}`;

    const tagClass =
      r.status === "missing" ? "missing" : r.status === "submitted" ? "submitted" : "updated";

    row.innerHTML = `
      <div class="name">${escapeHtml(r.e.name)}</div>
      <div class="statusTag ${tagClass}">
        ${r.status === "missing" ? "未提出" : r.status === "submitted" ? "提出" : "更新"}
        ${r.status === "updated" ? " 🔒" : ""}
      </div>
      <div class="barWrap" aria-label="週合計バー">
        <div class="bar ${tagClass}" style="width:${barPct}%"></div>
      </div>
      <div class="total">${totalLabel}</div>
      <button class="btn more" type="button" ${r.status === "missing" ? "disabled" : ""}>⋯</button>
    `;

    const moreBtn = row.querySelector("button.more") as HTMLButtonElement;
    moreBtn.addEventListener("click", () => openDetail(r.e.employee_id));

    statusList.appendChild(row);
  }

  // ranking
  const rankRows = rows
    .filter((r) => r.status !== "missing")
    .sort((a, b) => b.totalMin - a.totalMin);

  const rankMax = Math.max(0, ...rankRows.map((r) => r.totalMin));
  rankingList.innerHTML = "";
  if (rankRows.length === 0) {
    rankingList.innerHTML = `<div class="muted small">提出データがありません</div>`;
  } else {
    rankRows.forEach((r, idx) => {
      const pct = rankMax === 0 ? 0 : Math.round((r.totalMin / rankMax) * 100);
      const el = document.createElement("div");
      el.className = "rankRow";
      el.innerHTML = `
        <div class="rankNo">${idx + 1}</div>
        <div>
          <div style="display:flex; justify-content:space-between; gap:10px; margin-bottom:6px;">
            <div style="font-weight:600;">${escapeHtml(r.e.name)}</div>
            <div class="rankVal">${minutesToHHMM(r.totalMin)}</div>
          </div>
          <div class="rankBarWrap"><div class="rankBar" style="width:${pct}%"></div></div>
        </div>
        <div class="muted">${r.status === "submitted" ? "提出" : "更新"}</div>
      `;
      rankingList.appendChild(el);
    });
  }

  
}
// 今月見通し（週開始日を基準にする版）
function renderForecast(m: MonthlySummary, weekStartYmd: string) {
  // meta
  forecastMeta.textContent = `${m.month} / 所定労働時間は社員ごと`;

  forecastList.innerHTML = "";
  if (!m.rows?.length) {
    forecastList.innerHTML = `<div class="muted small">社員データがありません</div>`;
    return;
  }

  // month range
  const monthStart = new Date(`${m.month}-01T00:00:00`);
  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

  // ✅ 基準日は「週開始日」
  let baseDate = new Date(`${weekStartYmd}T00:00:00`);
  if (baseDate < monthStart) baseDate = monthStart;
  if (baseDate >= nextMonthStart) {
    // 月を超えてたら「残り0」扱い
    baseDate = nextMonthStart;
  }

  const msLeft = Math.max(0, nextMonthStart.getTime() - baseDate.getTime());
  const daysLeft = msLeft / (1000 * 60 * 60 * 24);

  // ✅ 暴れ防止：残り週数は切り上げ（最低1週）
  const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));

  for (const r of m.rows) {
    const target = Number((r as any).target_minutes ?? 0) || 0;
    const total = Number(r.total_minutes ?? 0) || 0;

    const remaining = Math.max(0, target - total);
    const avg = remaining / weeksLeft;

    const el = document.createElement("div");
    el.className = "forecastRow";
    el.innerHTML = `
      <div>
        <div class="forecastName">${escapeHtml(r.name)}</div>
      </div>

      <div class="forecastRight">
        <div class="forecastMain">残り ${minutesToHHMM(remaining)}</div>
        <div class="forecastTiny">残り週平均 ${minutesToHHMM(Math.round(avg))} / 週</div>
      </div>
    `;
    forecastList.appendChild(el);
  }
}


// ====== LEAVE RENDER ======
function renderLeave(leave: LeaveAdminSummaryResponse) {
  // header
  leaveMeta.textContent = `有給（as of ${leave.as_of.slice(0, 10)}）`;

  // balances（残日数）
  leaveBalanceList.innerHTML = "";
  const balances = [...leave.rows].sort((a, b) => a.name.localeCompare(b.name, "ja"));

  if (balances.length === 0) {
    leaveBalanceList.innerHTML = `<div class="muted small">残日数データなし</div>`;
  } else {
    for (const b of balances) {
      const el = document.createElement("div");
      el.className = "leaveItem";
      const days = Number.isFinite(b.remaining_days) ? b.remaining_days : 0;
      el.innerHTML = `
        <div class="name">${escapeHtml(b.name)}</div>
        <div class="right"><span class="muted">残り ${days.toFixed(1)} 日</span></div>
        <div></div>
        <div><div>
      `;
      leaveBalanceList.appendChild(el);
    }
  }

  // recent requests（直近申請：rowsのlast_requestがある人だけ）
  leaveRecentList.innerHTML = "";
  const recents = leave.rows
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  leaveRecentList.innerHTML = "";
  if (recents.length === 0) {
    leaveRecentList.innerHTML = `<div class="muted small">直近申請なし</div>`;
  } else {
    for (const r0 of recents) {
        const el = document.createElement("div");
        el.className = "leaveItem";

        const  lr = r0.last_request;

        if (!lr) {
            el.innerHTML = `
              <div>
                <div style="font-weight:600;">${escapeHtml(r0.name)}</div>
                <div class="muted small">直近の申請なし</div>
              </div>
              <div class="right"><span class="badge muted">なし</span></div>
            `;
            leaveRecentList.appendChild(el);
            continue;
        }

        const badgeClass = lr.status;
        const badgeText = 
          lr.status === "requested"
            ? "承認待ち"
            : lr.status === "approved"
            ? "承認"
            : lr.status === "rejected"
            ? "却下"
            : lr.status === "consult"
        el.innerHTML = `
          <div>
            <div style="font-weight:600;">${escapeHtml(r0.name)}</div>
            <div class="muted small">${ymdToMd(lr.date)} / ${Number(lr.days).toFixed(1)}日</div>
          </div>
          <div class="right"><span class="badge ${badgeClass}">${badgeText}</span></div>
        `;
        leaveRecentList.appendChild(el);
    }
  }
 
}



// ====== DETAIL MODAL ======
detailCloseBtn.addEventListener("click", () => detailModal.close());

async function openDetail(employeeId: string) {
  if (!currentDashboard) return;

  // ここは「詳細API」を別で用意できるとベスト。
  // v0.1は dashboard だけだと日別が取れないので、詳細API前提で叩く。
  // GET /api/worktime/admin/submission?employee_id=...&week_start=...
  const ws = currentDashboard.week_start;

  type Detail = {
    employee_id: string;
    name: string;
    week_start: string;
    data: Record<string, number>; // { mon: 480, tue: 0 ... } or {"2026-01-26":480 ...}
    total_minutes: number;
    status: "submitted" | "updated";
    comment?: string | null;
  };

  try {
    const detail = await apiGet<Detail>(
      `/api/worktime/admin/submission?employee_id=${encodeURIComponent(employeeId)}&week_start=${encodeURIComponent(ws)}`
    );

    detailTitle.textContent = `${detail.name} の詳細`;
    detailSub.textContent = `${ymdToMd(detail.week_start)}週 / ${detail.status === "submitted" ? "提出" : "更新 🔒"}`;

    renderDetailDays(detail.week_start, detail.data);
    detailTotal.textContent = minutesToHHMM(detail.total_minutes);

    if (detail.comment && detail.comment.trim()) {
      detailCommentRow.classList.remove("hidden");
      detailComment.textContent = detail.comment;
    } else {
      detailCommentRow.classList.add("hidden");
      detailComment.textContent = "";
    }

    detailModal.showModal();
  } catch {
    alert("詳細の取得に失敗しました（submission API を確認）");
  }
}

function renderDetailDays(weekStart: string, data: Record<string, number>) {
  // dataキーが曜日(mon..sun)でも日付でも対応する
  const mon = new Date(weekStart + "T00:00:00");
  const days: { key: string; label: string; dow: string; minutes: number }[] = [];

  const dow = ["日", "月", "火", "水", "木", "金", "土"];
  const short = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(d.getDate() + i);
    const ymd = toYmd(d);
    const dayOfWeek = dow[d.getDay()];
    const label = ymdToMd(ymd);

    const v =
      data[ymd] ??
      data[short[i]] ??
      0;

    days.push({ key: ymd, label, dow: dayOfWeek, minutes: v });
  }

  detailDays.innerHTML = "";
  for (const x of days) {
    const el = document.createElement("div");
    el.className = "dayBox";
    el.innerHTML = `
      <div class="dayName">${x.label}(${x.dow})</div>
      <div class="dayVal">${minutesToHHMM(x.minutes)}</div>
    `;
    detailDays.appendChild(el);
  }
}

const setRemainBtnState = (state: "idle" | "loading" | "done") => {
  if (!remainBtn) return;
  if (state === "idle") {
    remainBtn.disabled = false;
    remainBtn.textContent = "リマインド送信";
    return;
  }
  if (state === "loading") {
    remainBtn.disabled = true;
    remainBtn.textContent = "送信中…";
    return;
  }
  // done
  remainBtn.disabled = true;
  remainBtn.textContent = "送信済み";
  setTimeout(() => setRemainBtnState("idle"), 1200);
};

// 前週に対してRe:Mindメールのヘルパー
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

remainBtn?.addEventListener("click", async () => {
  const token = getToken();
  if (!token) {
    alert("管理者トークンがありません。再ログインしてください。");
    return;
  }

  const week_start = String(weekStartEl?.value ?? "").trim();
  if (!week_start) {
    alert("週（開始日）が未選択です。");
    return;
  }

  const target_week_start = toYmd(addDays(new Date(`${week_start}T00:00:00`), -7));

  if (!confirm(`未提出者のリマインドを送信します。\n対象週（開始日）：${target_week_start}\nよろしいですか？`)) {
    return;
  }

  setRemainBtnState("loading");

  try {
    const res = await fetch("/api/worktime/admin/remind", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ week_start: target_week_start }),
    });

    const json = await res.json().catch(() => ({} as any));

    if (!res.ok || json?.ok === false) {
      const msg = json?.detail || json?.error || `HTTP ${res.status}`;
      alert(`送信に失敗しました: ${msg}`);
      return;
    }

    const missing = Number(json?.missing_total ?? 0);
    const sent = Number(json?.sent ?? 0);
    const skipped = Number(json?.skipped_no_email ?? 0);

    let msg = "";
    if (missing === 0) {
      msg = "未提出が0名なので送信しませんでした。";
    } else if (sent === 0) {
      msg = `未提出は${missing}名ですが、メール未登録のため送信できませんでした（未登録: ${skipped}名）`;
    } else if (skipped > 0) {
      msg = `送信しました（未提出: ${missing}名 / 送信: ${sent}名 / メール未登録: ${skipped}名）`;
    } else {
      msg = `送信しました（未提出: ${missing}名 / 送信: ${sent}名）`;
    }

    alert(msg);

  } catch (e: any) {
    alert(`送信に失敗しました: ${String(e?.message ?? e)}`);
  } finally {
    setRemainBtnState("idle"); 
  }
});

// ====== SAFE HTML ======
function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ====== START ======
boot();
