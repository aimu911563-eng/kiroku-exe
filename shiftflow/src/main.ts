//import { Style } from "hono/css";
//import { resolve } from "node:dns";
//import { escape } from "node:querystring";

console.log("ShiftFlow main.ts 読み込み完了:)");

type ShiftDayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type ShiftData = Record<ShiftDayKey, string>;
type StoreId = "terajima" | "kosai" | "hamakita"; //寺島、湖西、浜北
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

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
const confirmSubmitBtn = document.getElementById("confirmSubmitbtn") as HTMLButtonElement 



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

function buildConfirmHtml(payload: {
  store_id: string;
  employee_id: string;
  employee_name: string;
  week_start: string;
  data: Record<string, string>;
  is_holiday: boolean;
  comment: string,
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

  return `
    <div style="display: flex; gap:12px; flex-wrap:wrap; margin-bottom: 10px;">
      <div><b>従業員</b>: ${payload.employee_name} (${payload.employee_id}) </div>
      <div><b>店舗</b>: ${payload.store_id}</div>
      <div><b>週</b>: ${payload.week_start} (${range}) </div>
      <div><b>祝日扱い</b>: ${payload.is_holiday ? "ON" : "OFF"}</div>
    </div>
    
    <table style="width: 100px; border-collapse:collaose;">
      <thead>
        <tr>
          <th style="border: 1px solid #ddd; padding: 8px;">曜日</th>
          <th style="border: 1px solid #ddd; padding: 8px;">時間</th>
        </th>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top: 10px";>
      <b>コメント</b><br/>
      <div style="white-space-wrap; border: 1px solid #ddd padding: 8px; border-redius: 8px;">
        ${escapeHtml(comment)}
      </div>
    </div>
    <p style="margin-top: 10px; font-size: 12px; color: #666;">
      *間違っていたら「戻る」で修正してから提出してください
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

type Employee = {
  employee_id: string;
  employee_name: string;
  store_id: string;
};
let currentEmployee: {
  employee_id: string;
  employee_name: string;
  store_id: string;
} | null = null;

async function fetchEmployee(employeeId: string) {
  const res = await fetch(
    `/api/employee?employee_id=${encodeURIComponent(employeeId)}`
  );
  const json = await res.json();
  return json as
    | { ok: true; employee: Employee }
    | { ok: false; error: string };
}

async function updateEmployeeAutoFill() {
  if (!employeeIdInput) return;

  const employeeId = employeeIdInput.value.trim();

  // 短い間は何もしない
  if (employeeId.length < 4) {
    currentEmployee = null;
    if (employeeNameInput) employeeNameInput.value = "";
    if (storePreview) storePreview.textContent = "";
    return;
  }

  const result = await fetchEmployee(employeeId);

  if (!result.ok) {
    currentEmployee = null;
    if (employeeNameInput) employeeNameInput.value = "";
    if (storePreview) storePreview.textContent = "従業員が見つかりません";
    return;
  }

  currentEmployee = result.employee;
  if (employeeNameInput)
    employeeNameInput.value = currentEmployee.employee_name;
  if (storePreview)
    storePreview.textContent = `店舗: ${currentEmployee.store_id}`;

  currentEmployee = result.employee;

  // 従業員が確定したら営業時間の制限を適用
  applyBusinessHoursToTimeInputs(
    currentEmployee.store_id as StoreId,
    !!holidayToggle?.checked
  );


  let lastLoadedKey = ""

  async function loadExistingSubmissionIfAny() {
    if (!currentEmployee) return;
    const weekStart = weekStartInput.value
    if (!weekStart) return;

    const key = `${currentEmployee.employee_id}_${weekStart}`;
    if (key === lastLoadedKey) return;
    lastLoadedKey = key;
  }

  const prevEmployeeId = currentEmployee?.employee_id;

  currentEmployee = result.employee;

  //従業員が変わったら一旦クリア
  if (prevEmployeeId && prevEmployeeId !== currentEmployee.employee_id) {
    clearShiftInputs();
  }

  await loadExistingSubmissionIfAny();
}

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
  if (!currentEmployee) return;

  const weekStart = weekStartInput.value;
  if (!weekStart) return;

  const res = await fetch(
    `/api/shifts?employee_id=${encodeURIComponent(
      currentEmployee.employee_id
    )}&week_start=${encodeURIComponent(weekStart)}`
  );

  type GetShiftRes = 
    | { ok: true; submission: ShiftSubmission }
    | { ok: false; error: string }

  const json = (await res.json()) as GetShiftRes;

  if (!json.ok) {
    if (res.status === 404) {
      clearShiftInputs();
      return;
    }
    console.error("loadExistingSubmission error:", json);
    return;
  }

  const submission = json.submission;
  applyBusinessHoursToInputs(submission.data ?? {});
  updatePreview(submission);
}

// debounce 300ms
let employeeLookTimer: number | undefined;

employeeIdInput?.addEventListener("input", () => {
  if (employeeLookTimer) window.clearTimeout(employeeLookTimer);
  employeeLookTimer = window.setTimeout(() => {
    updateEmployeeAutoFill().catch(console.error);
  }, 300);
});

// プレビュー
function updatePreview(payload: unknown) {
  preview.textContent = JSON.stringify(payload, null, 2);
}

// フォーム送信
shiftForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const employeeId = (employeeIdInput?.value ?? "").trim();
  if (employeeId.length < 4) {
    alert("従業員番号を入力してね");
    return;
  }

  if (!currentEmployee || currentEmployee.employee_id !== employeeId) {
    await updateEmployeeAutoFill();
  }
  if (!currentEmployee) {
    alert("従業員番号が見つからないので送信できません");
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
  };

  const ok = await openConfirm(payload);
  if (!ok) return;

  const submitBtn = shiftForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;
  submitBtn && (submitBtn.disabled = true);

  try {
    const res = await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      alert(`送信に失敗しました: ${json?.error ?? `HTTP ${res.status}`}`);
      return;
    }

    alert("シフト提出完了:)");
  } finally {
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

  updateWeekLabel(weekStartInput.value);

  //週が確定したら既存提出を読み込む
  await loadExistingSubmissionIfAny();
});


initWeekStart();

