
console.log("ShiftFlow main.ts 読み込み完了:)");

type ShiftDayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type ShiftData = Record<ShiftDayKey, string>;
type StoreId = "terajima" | "kosai" | "hamakita"; //寺島、湖西、浜北
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const API_BASE = "https://shiftflow-api.aimu911563.workers.dev";

const BUSINESS_HOURS: Record<StoreId, {
  weekday: { open: string; close: string };
  weekendHoliday: { open: string; close: string };
}> = {
  "terajima": { weekday:{open:"10:00",close:"23:00"}, weekendHoliday:{open:"10:00",close:"24:00"} },
  "hamakita": { weekday:{open:"10:00",close:"21:00"}, weekendHoliday:{open:"10:00",close:"22:00"} },
  "kosai": { weekday:{open:"15:00",close:"22:00"}, weekendHoliday:{open:"10:00",close:"22:00"} },
} satisfies Record<StoreId, {
  weekday: { open: string; close: string };
  weekendHoliday: { open: string; close: string };
}>;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type ShiftSubmission = {
  store_id: string;
  employee_id: string;
  employee_name: string;
  week_start: string;
  data: Record<string, string>;
  comment?: string;
};

// DOM要素
const shiftForm = document.getElementById("shiftForm") as HTMLFormElement;
const weekStartInput = document.getElementById("weekStart") as HTMLInputElement;
const weekLabel = document.getElementById("weekLabel") as HTMLParagraphElement;
const preview = document.getElementById("preview") as HTMLPreElement;

const employeeIdInput = document.getElementById(
  "employeeId"
) as HTMLInputElement | null;
const employeeNameInput = document.getElementById(
  "employeeName"
) as HTMLInputElement | null;
const storePreview = document.getElementById(
  "storePreview"
) as HTMLParagraphElement | null;

// time input
const shiftInputs = document.querySelectorAll<HTMLInputElement>(
  "input[data-day][data-kind]"
);

const holidayToggle = document.getElementById("holidayToggle") as HTMLInputElement | null;
const hoursPreview = document.getElementById("hoursPreview") as HTMLParagraphElement | null;

const confirmOverlay = document.getElementById("confirmOverlay") as HTMLDivElement | null;
const confirmSummary = document.getElementById("confirmSummary") as HTMLDivElement | null;
const confirmCloseBtn = document.getElementById("confirmCloseBtn") as HTMLButtonElement | null;
const confirmCancelBtn = document.getElementById("confirmCancelBtn") as HTMLButtonElement | null;
const commentEl = document.getElementById("comment") as HTMLTextAreaElement | null;
const confirmSubmitBtn = document.getElementById("confirmSubmitBtn") as HTMLButtonElement | null;
//const submitStatusEl = document.getElementById("submitStatus") as HTMLParagraphElement | null;
const commentCount = document.getElementById("commentCount") as HTMLDivElement | null;
const EMP_TOKEN_KEY = "shiftflow_employee_token";
const loginArea = document.getElementById("loginArea") as HTMLDivElement | null;
const userBar = document.getElementById("userBar") as HTMLDivElement | null;
const shiftArea = document.getElementById("shiftArea") as HTMLDivElement | null;
const loginUserLabel = document.getElementById("loginUserLabel") as HTMLSpanElement | null;

function setLoginUserLabell(name: string) {
  if (loginUserLabel) loginUserLabel.textContent = `👤 ${name}`;
}

function updateAuthUI() {
  const loggedIn = !!currentEmployee && !!localStorage.getItem(EMP_TOKEN_KEY);
  if (loginArea) loginArea.style.display = loggedIn ? "none" : "block";
  if (userBar) userBar.style.display = loggedIn ? "block" : "none";
  if (shiftArea) shiftArea.style.display = loggedIn ? "block" : "none";
}

const DAY_KEYS = ["mon","tue","wed","thu","fri","sat","sun"] as const;

function updateDayDatesByInputs(weekStartStr: string) {
  if (!weekStartStr) return;

  const base = new Date(weekStartStr);
  if (Number.isNaN(base.getTime())) return;

  DAY_KEYS.forEach((day, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);

    const mm = d.getMonth() + 1;
    const dd = d.getDate();
    const label = `${mm}/${dd}`;

    // その曜日の input を1個拾って、その行(tr)の最初のtd(曜日セル)に日付を入れる
    const input = document.querySelector<HTMLInputElement>(`input[type="time"][data-day="${day}"]`);
    if (!input) return;

    const tr = input.closest("tr");
    const dayTd = tr?.querySelector("td"); // 1列目=曜日
    if (!dayTd) return;

    // まだ日付用spanが無ければ作る
    let dateEl = dayTd.querySelector<HTMLSpanElement>(".date");
    if (!dateEl) {
      dateEl = document.createElement("span");
      dateEl.className = "date";
      dateEl.style.marginLeft = "6px";
      dateEl.style.fontSize = "12px";
      dateEl.style.color = "#666";
      dayTd.appendChild(dateEl);
    }

    dateEl.textContent = label;
  });
}


// 今週の月曜
function getThisMonday(date = new Date()): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function updateWeekLabel(weekStartStr: string) {
  if (!weekStartStr) {
    weekLabel.textContent = "";
    return;
  }

  const d = new Date(weekStartStr);
  if (Number.isNaN(d.getTime())) {
    weekLabel.textContent = "";
    return;
  }

  const end = new Date(d);
  end.setDate(end.getDate() + 6);

  const startLabel = `${d.getMonth() + 1}/${d.getDate()}`;
  const endLabel = `${end.getMonth() + 1}/${end.getDate()}`;
  weekLabel.textContent = `対象期間: ${startLabel}〜${endLabel}`;
}

function initWeekStart() {
  const monday = getThisMonday();
  const iso = toISODate(monday);
  weekStartInput.value = iso;
  updateWeekLabel(iso);
  updateDayDatesByInputs(weekStartInput.value);
}

// 5分丸め
function snapToFiveMinutes(input: HTMLInputElement) {
  const value = input.value;
  if (!value) return;

  const [h, m] = value.split(":");
  let minutes = Number(m);
  if (Number.isNaN(minutes)) return;

  let snapped = Math.round(minutes / 5) * 5;
  if (snapped > 55) snapped = 55;
  if (snapped < 0) snapped = 0;

  const mm = String(snapped).padStart(2, "0");
  input.value = `${h}:${mm}`;
}

shiftInputs.forEach((input) => {
  input.addEventListener("change", () => snapToFiveMinutes(input));
  input.addEventListener("blur", () => snapToFiveMinutes(input));
});

//週表示＋曜日一覧
function formatWeekRange(weekStartISO: string) {
  const d = new Date(weekStartISO);
  if (Number.isNaN(d.getTime())) return "";
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}~${pad(end.getMonth() + 1)}/${pad(end.getDate())}`;
}

//コメント文字制限
function updateCommentCount() {
  if (!commentEl || !commentCount) return;
  const len = commentEl.value.length;
  commentCount.textContent = `${len}/300`;

  const comment = (commentEl?.value ?? "").trim();
    if (comment.length > 300) {
    alert("コメントは300文字以内でお願いします");
    return;
  }
}

commentEl?.addEventListener("input", updateCommentCount);
updateCommentCount();


function buildConfirmHtml(payload: {
  store_id: string;
  employee_id: string;
  employee_name: string;
  week_start: string;
  data: Record<string, string>;
  is_holiday: boolean;
  comment: string,
  mode: "submitted" | "update";
}) {
  const days = [
    ["mon", "月"], ["tue", "火"], ["wed", "水"], ["thu", "木"], ["fri", "金"], ["sat", "土"], ["sun", "日"],
  ] as const;

  const rows = days.map(([k, label]) => {
    const v = (payload.data?.[k] ?? "").trim() || "-";
    return `
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px; width: 90px;">${label}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${v}</td>
      </tr>
    `;
  }).join("");

  const range = formatWeekRange(payload.week_start);
  const comment = (payload.comment ?? "").trim();

  const note = payload.mode === "update"
    ?"* これは「修正（1回目）」として保存されます。以後は修正できません。必要なら店長に連絡してください。"
    :"* この内容で提出します。提出後は一回だけ修正できます。";

  return `
    <div style="display: flex; gap:12px; flex-wrap:wrap; margin-bottom: 10px;">
      <div><b>従業員</b>: ${payload.employee_name} (${payload.employee_id}) </div>
      <div><b>店舗</b>: ${payload.store_id}</div>
      <div><b>週</b>: ${payload.week_start} (${range}) </div>
      <div><b>祝日扱い</b>: ${payload.is_holiday ? "ON" : "OFF"}</div>
    </div>
    
    <table style="width: 100%; border-collapse:collapse;">
      <thead>
        <tr>
          <th style="border: 1px solid #ddd; padding: 8px;">曜日</th>
          <th style="border: 1px solid #ddd; padding: 8px;">時間</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top: 10px";>
      <b>コメント</b><br/>
      <div style="white-space-: pre-wrap; border: 1px solid #ddd padding: 8px; border-radius: 8px;">
        ${escapeHtml(comment)}
      </div>
    </div>
    <p style="margin-top: 10px; font-size: 12px; color: #666;">
      *間違っていたら「戻る」で修正してから提出してください
    </p>
    <p style="margin-top: 10px; font-size: 12px; color: #666;">
      ${note}
    </p>
  `;
}

//モーダルの開閉
function openConfirm(payload: any): Promise<boolean> {
  return new Promise((resolve) => {
    if (!confirmOverlay || !confirmSummary || !confirmSubmitBtn ||  !confirmCancelBtn || !confirmCloseBtn) {
      resolve(window.confirm("この内容で提出しますか？"));
      return;
    }

    confirmSummary.innerHTML = buildConfirmHtml(payload);

    const cleanup = () => {
      confirmOverlay.style.display = "none";
      confirmSubmitBtn.onclick = null;
      confirmCancelBtn.onclick = null;
      confirmCloseBtn.onclick = null;
      confirmOverlay.onclick = null;
      document.removeEventListener("keydown", onkeydown);
    };

    const onkeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cleanup();
        resolve(false);
      }
    };

    confirmSubmitBtn.onclick = () => { cleanup(); resolve(true); };
    confirmCancelBtn.onclick = () => { cleanup(); resolve(false); };
    confirmCloseBtn.onclick= () => { cleanup(); resolve(false); };

    //背景クリックで閉じる
    confirmOverlay.onclick = (e) => {
      if (e.target === confirmOverlay) {
        cleanup();
        resolve(false);
      }
    };

    document.addEventListener("keydown", onkeydown);
    confirmOverlay.style.display = "block";
  });
}


// 営業時間　金土日祝変更可能
function isWeekend(day: DayKey) {
  return day === "sat" || day === "sun";
}
 function applyBusinessHoursToTimeInputs(storeId: string, isHoliday: boolean) {
  const def = BUSINESS_HOURS[storeId as StoreId];
  if (!def) return;

  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

  days.forEach((day) => {
    const rule = (isWeekend(day) || isHoliday) ? def.weekendHoliday : def.weekday;
    const min = rule.open;
    const max = rule.close === "24:00" ? "23:59" : rule.close;

    document.querySelectorAll<HTMLInputElement>(`input[type="time"][data-day="${day}"][data-kind]`)
      .forEach((el) => {
        el.min = min;
        el.max = max;
        el.step = "300";
      });
  });

  if (hoursPreview) {
    const w = def.weekday, h = def.weekendHoliday;
    hoursPreview.textContent = `営業時間（平日 ${w.open}~${w.close} / 金土日祝 ${h.open}~${h.close} ` +
    (isHoliday ? " ← 祝日ON" : "");
  }
}

holidayToggle?.addEventListener("change", () => {
  if (!currentEmployee) return;
  applyBusinessHoursToTimeInputs(currentEmployee.store_id, holidayToggle.checked);
});

//削除ボタン
function clearDay(day: DayKey) {
  document.querySelectorAll<HTMLInputElement>(
    `input[type="time"][data-day="${day}"][data-kind]`
  ).forEach((el) => {
    el.value = "";
    el.setCustomValidity("");
  });
}

document.querySelectorAll<HTMLButtonElement>("[data-clear-day]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const day = btn.dataset.clearDay as DayKey | undefined;
    if (!day) return;
    clearDay(day)
  })
})

//木曜日締め切り

function updateDeadline() {
  const weekStartEl = document.getElementById("weekStart") as HTMLInputElement | null;
  if (!weekStartEl?.value) return;

  applyDeadlineUI(weekStartEl.value); // さっき渡した関数
}

updateDeadline();
document.getElementById("weekStart")?.addEventListener("change", updateDeadline);

function parseYMDToJSTStart(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0); // ローカル0:00（運用がJSTならこれでOK）
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatJP(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const w = ["日","月","火","水","木","金","土"][date.getDay()];
  return `${y}/${m}/${d}(${w})`;
}

function getDeadlineForWeekStart(weekStartYMD: string) {
  const weekStart = parseYMDToJSTStart(weekStartYMD);   // 月曜0:00
  const deadline = addDays(weekStart, -4);              // 前週木曜0:00
  return deadline;
}

function isAfterDeadline(weekStartYMD: string, now = new Date()) {
  const deadline = getDeadlineForWeekStart(weekStartYMD);
  return now.getTime() >= deadline.getTime();
}

function applyDeadlineUI(weekStartYMD: string) {
  const deadline = getDeadlineForWeekStart(weekStartYMD);

  const line = document.getElementById("deadlineLine");
  const warn = document.getElementById("deadlineWarn");
  const submitBtn = document.getElementById("btn btnPrimary") as HTMLButtonElement | null; // ←あなたの提出ボタンIDに合わせて

  if (line) {
    // 「木曜0:00で締切」を分かりやすく
    const limit = new Date(deadline.getTime() - 1); // 水曜23:59:59相当の見せ方
    line.textContent = `提出期限：${formatJP(limit)} まで（木曜0:00で締切）`;
  }

  const blocked = isAfterDeadline(weekStartYMD);

  if (submitBtn) submitBtn.disabled = blocked;

  if (warn) {
    if (blocked) {
      warn.textContent = "この週の提出期限を過ぎています（木曜0:00以降は提出できません）";
      warn.classList.remove("hidden");
    } else {
      warn.textContent = "";
      warn.classList.add("hidden");
    }
  }
}

//週変更のたびに
const weekStartEl = document.getElementById("weekStart") as HTMLInputElement | null;

if (weekStartEl?.value) applyDeadlineUI(weekStartEl.value);

weekStartEl?.addEventListener("change", () => {
  if (weekStartEl.value) applyDeadlineUI(weekStartEl.value);
});



// シフトデータ収集
function collectShiftData(): ShiftData {
  const inputs = document.querySelectorAll<HTMLInputElement>(
    'input[type="time"][data-day][data-kind]'
  );

  const temp: Record<ShiftDayKey, { start: string; end: string }> = {
    mon: { start: "", end: "" },
    tue: { start: "", end: "" },
    wed: { start: "", end: "" },
    thu: { start: "", end: "" },
    fri: { start: "", end: "" },
    sat: { start: "", end: "" },
    sun: { start: "", end: "" },
  };

  inputs.forEach((input) => {
    const day = input.dataset.day as ShiftDayKey;
    const kind = input.dataset.kind as "start" | "end";
    temp[day][kind] = input.value;
  });

  const result: Partial<ShiftData> = {};
  (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as ShiftDayKey[]).forEach(
    (day) => {
      const { start, end } = temp[day];
      if (!start && !end) result[day] = "";
      else if (start && end) result[day] = `${start}-${end}`;
      else result[day] = start || end || "";
    }
  );

  return result as ShiftData;
}

// ===== 従業員番号→DBから氏名自動反映 =====

/*function getEmployeePayload() {
  const token = localStorage.getItem(EMP_TOKEN_KEY);
  if (!token) return null;
  return parseJwt(token);
}*/

async function employeeLogin(employee_id: string, pin: string) {
  const res = await fetch(`${API_BASE}/api/employee/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id, pin }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json.ok) {
    return { ok: false as const, error: json?.error ?? `login failed: ${res.status}` };
  }
  return { 
    ok: true as const, 
    token: json.token as string, 
    store_id: json.store_id as string,
    employee_name: json.employee_name as string,
  };
}

//クリックイベント
function $(id: string) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el;
}

function  setAuthMsg(msg: string)  {
  const el = $("employeeAuthMsg");
  el.textContent = msg;
}

function getToken() {
  return localStorage.getItem(EMP_TOKEN_KEY);
}

/*function setLoginUserLabel(name: string) {
  const el = document.getElementById("loginUserLabel");
  if (el) el.textContent = `ログイン中：${name}`;
}*/

function clearToken() {
  localStorage.removeItem(EMP_TOKEN_KEY);
}

function getEl<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}


async function handleEmployeeLogin() {
  setAuthMsg("");

  const employee_id = (employeeIdInput?.value ?? "").trim();
  const pin = ((document.getElementById("pinInput") as HTMLInputElement | null)?.value ?? "").trim();

  if (!employee_id || !/^\d{8}$/.test(employee_id)) return setAuthMsg("従業員番号は8桁で入力してね");
  if (!pin || !/^\d{4}$/.test(pin)) return setAuthMsg("PINは4桁で入力してね");
  

  const result = await employeeLogin(employee_id, pin);
  if (!result.ok) {
    setAuthMsg(result.error);
    return
  };
  
  //token保存
  localStorage.setItem(EMP_TOKEN_KEY, result.token);

  currentEmployee = {
    employee_id,
    employee_name: result.employee_name,
    store_id: result.store_id,
  };

  applyBusinessHoursToTimeInputs(currentEmployee.store_id as StoreId, !!holidayToggle?.checked);
  
  setAuthMsg(`ログインしました: ${result.employee_name}`);
  setLoginUserLabell(`${result.employee_name} (${result.store_id})`);
  //setLoginUserLabel(result.employee_name);
  updateAuthUI();
}

function handleEmployeeLogout() {
  clearToken();
  currentEmployee = null;

  // 入力系（optional chaining で代入しない）
  const pinInput = getEl<HTMLInputElement>("pinInput");
  if (pinInput) pinInput.value = "";

  // 従業員番号
  const empIdInput = getEl<HTMLInputElement>("employeeId");
  if (empIdInput) empIdInput.value = "";

  if (commentEl) { commentEl.value = ""; updateCommentCount(); }
  if (holidayToggle) holidayToggle.checked = false;

  // 表示系
  setAuthMsg("ログアウトしました");
  if (hoursPreview) hoursPreview.textContent = "";
  if (storePreview) storePreview.textContent = "";
  if (employeeNameInput) employeeNameInput.value = "";

  // シフト入力/プレビュー
  clearShiftInputs();
  updatePreview({});

  setLoginUserLabell("");
  updateAuthUI()

  initWeekStart();
}


document.getElementById("employeeLoginBtn")?.addEventListener("click", handleEmployeeLogin);
document.getElementById("employeeLogoutBtn")?.addEventListener("click", handleEmployeeLogout);


//shiftDate → time inputへ反映
function applyBusinessHoursToInputs(data: Record<string, string>) {
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

  days.forEach((day) => {
    const startEl = document.querySelector<HTMLInputElement>(
      `input[type="time"][data-day=${day}][data-kind="start"]`
    );
    const endEl = document.querySelector<HTMLInputElement>(
      `input[type="time"][data-day="${day}"][data-kind="end"]`
    );

    const v = (data?.[day] ?? "").trim();

    if (!startEl || !endEl) return;

    if (!v) {
      startEl.value = "";
      endEl.value = "";
      return;
    }

    //17：00-21：00　想定
    if (v.includes("-")) {
      const [s, e] = v.split("-");
      startEl.value = (s ?? "").trim();
      endEl.value = (e ?? "").trim();
    } else {
      //片方だけ入ってるケースは strat に入れておく
      startEl.value = v;
      endEl.value = "";
    }

    //5分の奴呼ぶ
    snapToFiveMinutes(startEl);
    snapToFiveMinutes(endEl);
  });
}

async function loadExistingSubmissionIfAny() {
  hasExistingSubmission = false;

  const token = getToken();
  if (!token) return;

  const weekStart = weekStartInput.value;
  if (!weekStart) return;

  const res = await fetch(`/api/shifts?week_start=${encodeURIComponent(weekStart)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const json = await res.json().catch(() => null);

  if (!json?.ok) {
    if (res.status === 404) {
      hasExistingSubmission = false;
      clearShiftInputs();
      return;
    }
    console.error("loadExistingSubmission error:", json);
    return;
  }

  const submission = (json.submission ?? null) as ShiftSubmission | null;

  //submission が無いなら「初回」扱いで終わる
  if (!submission) {
    hasExistingSubmission = false;
    clearShiftInputs();
    return;
  }

  //ここまで来たら「既存あり」
  hasExistingSubmission = true;

  if (commentEl) {
    commentEl.value = submission.comment ?? "";
    updateCommentCount();
  }

  applyBusinessHoursToInputs(submission.data ?? {});
  updatePreview(submission);
}



// プレビュー
function updatePreview(payload: unknown) {
  preview.textContent = JSON.stringify(payload, null, 2);
}

// フォーム送信

type CurrentEmployee = {
  employee_id: string;
  employee_name: string;
  store_id: string;
}

let hasExistingSubmission = false; // その週に既存提出があるか

let currentEmployee: CurrentEmployee | null = null;

let isSubmitting = false;

shiftForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isSubmitting) return;

  const token = getToken();
  if (!token) {
    alert("先にログインしてね");
    return;
  }

  if (!currentEmployee) {
    alert("ログイン情報がありません（再ログインしてね）");
    return;
  }

  const payload = {
    store_id: currentEmployee.store_id,
    employee_id: currentEmployee.employee_id,
    employee_name: currentEmployee.employee_name,
    week_start: weekStartInput.value,
    data: collectShiftData(),
    is_holiday: !!holidayToggle?.checked,
    comment: (commentEl?.value ?? "").trim(),
    mode: hasExistingSubmission ? "update" : "submitted",
  };

  const ok = await openConfirm(payload);
  if (!ok) return;

  const submitBtn = shiftForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;
  submitBtn && (submitBtn.disabled = true);

  try {
    isSubmitting = true;

    const res = await fetch("/api/shifts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      alert(`送信に失敗しました: ${json?.error ?? `HTTP ${res.status}`}`);
      return;
    }

    alert("シフト提出完了:)");

    shiftForm.reset();
    initWeekStart();
    // ログイン状態は残すなら employeeId/pin は消さない設計に後で調整
  } finally {
    isSubmitting = false;
    submitBtn && (submitBtn.disabled = false);
  }
});



//従業員が切り替わった時に全入力クリア⇨既存提出があれば上書き
function clearShiftInputs() {
  const days = ["mon","tue","wed","thu","fri","sat","sun"] as const;

  days.forEach((day) => {
    const startEl = document.querySelector<HTMLInputElement>(
      `input[type="time"][data-day="${day}"][data-kind="start"]`
    );
    const endEl = document.querySelector<HTMLInputElement>(
      `input[type="time"][data-day="${day}"][data-kind="end"]`
    );
    if (startEl) startEl.value = "";
    if (endEl) endEl.value = "";
  });

  updatePreview({}); 
}

// 初期化
function normalizeToMondayISO(anyDateISO: string): string {
  const d = new Date(anyDateISO);
  if (Number.isNaN(d.getTime())) return anyDateISO;
  const monday = getThisMonday(d);
  return toISODate(monday);
}

//週開始inputが「任意の日付」を選べる想定で月曜日に補正する
let isNormalizingWeek = false;

weekStartInput.addEventListener("change", async () => {
  if (isNormalizingWeek) return;

  const picked = weekStartInput.value; //例　2025-12-17
  const mondayISO = normalizeToMondayISO(picked); //例　2025-12-15

  if (mondayISO !== picked) {
    isNormalizingWeek = true;
    weekStartInput.value = mondayISO;

    await loadExistingSubmissionIfAny();

    isNormalizingWeek = false;
  }
  
  updateDayDatesByInputs(weekStartInput.value);
  updateWeekLabel(weekStartInput.value);

  //週が確定したら既存提出を読み込む
  await loadExistingSubmissionIfAny();
});

initWeekStart();

