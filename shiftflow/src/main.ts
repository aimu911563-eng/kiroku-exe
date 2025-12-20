console.log("ShiftFlow main.ts 読み込み完了:)");

type ShiftDayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type ShiftData = Record<ShiftDayKey, string>;

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
  await loadExistingSubmissionIfAny();
}

//shiftDate → time inputへ反映
function applyShiftDataToInputs(data: Record<string, string>) {
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
  const json = await res.json();

  if (!json.ok) {
    //404は「未提出」なので何もしない
    if (res.status === 404) {
      //未提出→フォームクリアする？　検討
      return;
    }
    console.error("loadExistingSubmission error:", json);
    return;
  }

  const submission = json.submission;
  applyShiftDataToInputs(submission.data ?? {});
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

  // まだDB取得できてないなら、送信前に一回取得して確定させる
  if (!currentEmployee || currentEmployee.employee_id !== employeeId) {
    await updateEmployeeAutoFill();
  }

  if (!currentEmployee) {
    alert("従業員番号が見つからないので送信できません");
    return;
  }

  const weekStart = weekStartInput.value;
  const shifts = collectShiftData();

  const payload = {
    store_id: currentEmployee.store_id,
    employee_id: currentEmployee.employee_id,
    employee_name: currentEmployee.employee_name,
    week_start: weekStart,
    data: shifts,
  };

  updatePreview(payload);

  const res = await fetch("/api/shifts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  console.log("api result:", json);

  if (!json.ok) {
    alert(`送信に失敗しました: ${json.error ?? "unknown error"}`);
    return;
  }

  alert("シフト提出完了:)");
});

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
  if (!isNormalizingWeek) return;

  const picked = weekStartInput.value; //例　2025-12-17
  const mondayISO = normalizeToMondayISO(picked); //例　2025-12-15

  if (mondayISO !== picked) {
    isNormalizingWeek = true;
    weekStartInput.value = mondayISO;

    await loadExistingSubmissionIfAny();

    isNormalizingWeek = false;
  }
});

initWeekStart();

