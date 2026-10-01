
import {
  BUSINESS_HOURS,
  getShiftBounds,
  timeOptions,
  validateShiftDataForStore,
  type BusinessHoursDefinition,
  type ShiftDayKey,
  type StoreId,
  timeToMinutes,
} from "./shift-time";
import { submissionMessages } from "./submission-messages";
import { isEmployeeIdFormat } from "./employee-id";

console.log("ShiftFlow main.ts 読み込み完了:)");

type ShiftData = Record<ShiftDayKey, string>;
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const API_BASE = ""

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
  status?: "submitted" | "updated";
};

type SubmissionState = "none" | "submitted" | "updated";
let submissionState: SubmissionState = "none";
let hasExistingSubmission = false;

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

const hoursPreview = document.getElementById("hoursPreview") as HTMLParagraphElement | null;

const confirmOverlay = document.getElementById("confirmOverlay") as HTMLDivElement | null;
const confirmSummary = document.getElementById("confirmSummary") as HTMLDivElement | null;
const confirmCloseBtn = document.getElementById("confirmCloseBtn") as HTMLButtonElement | null;
const confirmCancelBtn = document.getElementById("confirmCancelBtn") as HTMLButtonElement | null;
const commentEl = document.getElementById("comment") as HTMLTextAreaElement | null;
const confirmSubmitBtn = document.getElementById("confirmSubmitBtn") as HTMLButtonElement | null;
const submitStatusEl = document.getElementById("submitStatus") as HTMLParagraphElement | null;
const commentCount = document.getElementById("commentCount") as HTMLDivElement | null;
const EMP_TOKEN_KEY = "shiftflow_employee_token";
const loginArea = document.getElementById("loginArea") as HTMLDivElement | null;
const userBar = document.getElementById("userBar") as HTMLDivElement | null;
const shiftArea = document.getElementById("shiftArea") as HTMLDivElement | null;
const loginUserLabel = document.getElementById("loginUserLabel") as HTMLSpanElement | null;
const employeeCalendar = document.getElementById("employeeCalendar") as HTMLElement | null;
const calendarMonth = document.getElementById("calendarMonth") as HTMLInputElement | null;
const calendarGrid = document.getElementById("calendarGrid") as HTMLDivElement | null;
const calendarStatus = document.getElementById("calendarStatus") as HTMLDivElement | null;
const successOverlay = document.getElementById("submissionSuccessOverlay") as HTMLDivElement | null;
const loginTransitionOverlay = document.getElementById("loginTransitionOverlay") as HTMLDivElement | null;
const employeeLoginButton = document.getElementById("employeeLoginBtn") as HTMLButtonElement | null;
const employeeAnnouncement = document.getElementById("employeeAnnouncement") as HTMLElement | null;
const employeeAnnouncementText = document.getElementById("employeeAnnouncementText") as HTMLParagraphElement | null;
let submissionCount = 0;

function setLoginUserLabell(name: string) {
  if (loginUserLabel) loginUserLabel.textContent = `👤 ${name}`;
}

function updateAuthUI() {
  const loggedIn = !!currentEmployee && !!localStorage.getItem(EMP_TOKEN_KEY);
  if (loginArea) loginArea.style.display = loggedIn ? "none" : "block";
  if (userBar) userBar.style.display = loggedIn ? "block" : "none";
  if (shiftArea) shiftArea.style.display = loggedIn ? "block" : "none";
  if (employeeCalendar) employeeCalendar.style.display = loggedIn ? "block" : "none";
}

function currentMonthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function loadEmployeeCalendar() {
  if (!calendarMonth || !calendarGrid || !calendarStatus || !currentEmployee) return;
  const token = localStorage.getItem(EMP_TOKEN_KEY);
  if (!token) return;
  if (!calendarMonth.value) calendarMonth.value = currentMonthValue();
  calendarStatus.textContent = "読み込み中...";
  const response = await fetch(`/api/employee/calendar?month=${encodeURIComponent(calendarMonth.value)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    calendarStatus.textContent = data?.error ?? "カレンダーを取得できませんでした";
    return;
  }
  renderEmployeeCalendar(calendarMonth.value, data.entries ?? {}, data.holidays ?? []);
  const confirmedCount = Object.values(data.entries ?? {}).filter((entry: any) => entry?.confirmed).length;
  calendarStatus.textContent = confirmedCount ? `確定シフト ${confirmedCount}日` : "公開された確定シフトはまだありません";
}

function renderEmployeeCalendar(
  month: string,
  entries: Record<string, { confirmed?: string; requested?: string }>,
  holidays: Array<{ date: string; name: string }>,
) {
  if (!calendarGrid) return;
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, monthNumber - 1, 1 - offset);
  const holidayMap = new Map(holidays.map((holiday) => [holiday.date, holiday.name]));
  const today = toISODate(new Date());
  const weekdayHeader = ["月", "火", "水", "木", "金", "土", "日"]
    .map((label, index) => `<div class="calendarWeekday ${index === 5 ? "sat" : index === 6 ? "sun" : ""}">${label}</div>`).join("");
  const cells: string[] = [];
  for (let index = 0; index < 42; index++) {
    const date = new Date(gridStart);
    date.setDate(date.getDate() + index);
    const iso = toISODate(date);
    const entry = entries[iso] ?? {};
    const holiday = holidayMap.get(iso);
    const classes = [
      "calendarDay",
      date.getMonth() !== monthNumber - 1 ? "outside" : "",
      date.getDay() === 6 ? "sat" : "",
      date.getDay() === 0 ? "sun" : "",
      holiday ? "holiday" : "",
      iso === today ? "today" : "",
    ].filter(Boolean).join(" ");
    cells.push(`<article class="${classes}">
      <div class="calendarDate"><strong>${date.getDate()}</strong>${holiday ? `<small>${escapeHtml(holiday)}</small>` : ""}</div>
      ${entry.confirmed ? `<div class="calendarShift confirmed"><span>確定</span>${escapeHtml(entry.confirmed)}</div>` : ""}
      ${entry.requested ? `<div class="calendarShift requested"><span>希望</span>${escapeHtml(entry.requested)}</div>` : ""}
    </article>`);
  }
  calendarGrid.innerHTML = `${weekdayHeader}${cells.join("")}`;
}

if (calendarMonth) {
  calendarMonth.value = currentMonthValue();
  calendarMonth.addEventListener("change", loadEmployeeCalendar);
}
document.getElementById("calendarToday")?.addEventListener("click", () => {
  if (!calendarMonth) return;
  calendarMonth.value = currentMonthValue();
  void loadEmployeeCalendar();
});
function moveCalendarMonth(offset: number) {
  if (!calendarMonth || !calendarMonth.value) return;
  const [year, month] = calendarMonth.value.split("-").map(Number);
  calendarMonth.value = currentMonthValue(new Date(year, month - 1 + offset, 1));
  void loadEmployeeCalendar();
}
document.getElementById("calendarPrevious")?.addEventListener("click", () => moveCalendarMonth(-1));
document.getElementById("calendarNext")?.addEventListener("click", () => moveCalendarMonth(1));

const DAY_KEYS = ["mon","tue","wed","thu","fri","sat","sun"] as const;
let currentBusinessHours: BusinessHoursDefinition | null = null;
let holidayDates = new Map<string, string>();
let holidayDays = new Set<ShiftDayKey>();

function updateDayDatesByInputs(weekStartStr: string) {
  if (!weekStartStr) return;

  const base = new Date(weekStartStr);
  if (Number.isNaN(base.getTime())) return;

  const jpWeek = ["月", "火", "水", "木", "金", "土", "日"] as const;

  DAY_KEYS.forEach((day, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);

    const mm = d.getMonth() + 1;
    const dd = d.getDate();
    const dow = jpWeek[i]; // 月〜日
    const ymd = toISODate(d);
    const holidayName = holidayDates.get(ymd);
    const label = `${mm}/${dd}（${dow}）${holidayName ? ` ${holidayName}` : ""}`;

    // その曜日の input を拾って行を特定
    const input = document.querySelector<HTMLInputElement>(
      `[data-day="${day}"][data-kind]`
    );
    if (!input) return;

    const tr = input.closest("tr");
    if (!tr) return;

    const dayTd = tr.querySelector<HTMLTableCellElement>("td");
    if (!dayTd) return;

    // 1列目を「日付（曜日）」にする
    dayTd.textContent = label;

    // 土日色（class付与）
    tr.classList.toggle("sat", day === "sat");
    tr.classList.toggle("sun", day === "sun");
    tr.classList.toggle("holiday", Boolean(holidayName));
  });
}

function validateShiftData(data: ShiftData): boolean {
  if (!currentEmployee) return false;
  const error = validateShiftDataForStore(
    currentEmployee.store_id,
    data,
    holidayDays,
    currentBusinessHours ?? undefined,
  );
  if (error) alert(error);
  return !error;
}

function totalShiftMinutes(data: ShiftData) {
  return Object.values(data).reduce((total, value) => {
    const match = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(value);
    if (!match) return total;
    const start = timeToMinutes(match[1]);
    const end = timeToMinutes(match[2]);
    return start === null || end === null ? total : total + Math.max(0, end - start);
  }, 0);
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}時間${rest}分` : `${hours}時間`;
}

function updateShiftSimulator() {
  const data = collectShiftData();
  const total = totalShiftMinutes(data);
  const days = Object.values(data).filter(Boolean).length;
  const totalEl = document.getElementById("simulatorTotal");
  const daysEl = document.getElementById("simulatorDays");
  const averageEl = document.getElementById("simulatorAverage");
  if (totalEl) totalEl.textContent = formatMinutes(total);
  if (daysEl) daysEl.textContent = `希望 ${days}日`;
  if (averageEl) averageEl.textContent = `1日平均 ${days ? formatMinutes(Math.round(total / days / 15) * 15) : "0時間"}`;
}

let mascotWakeTimer: number | undefined;
let mascotEventTimer: number | undefined;
let mascotEventEndTimer: number | undefined;

function scheduleMascotEvent(card: HTMLElement, firstEvent = false) {
  if (mascotEventTimer) window.clearTimeout(mascotEventTimer);
  if (mascotEventEndTimer) window.clearTimeout(mascotEventEndTimer);
  const bossCutin = document.getElementById("mascotBossCutin");
  bossCutin?.classList.remove("active");
  card.dataset.event = "none";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const delay = firstEvent ? 18000 + Math.random() * 12000 : 65000 + Math.random() * 70000;
  mascotEventTimer = window.setTimeout(() => {
    if (!card.isConnected || card.dataset.motion === "sleeping") {
      scheduleMascotEvent(card, true);
      return;
    }
    const roll = Math.random();
    const event = roll < .05 ? "bosswin" : roll < .48 ? "chase" : "battle";
    card.dataset.event = event;
    if (event === "bosswin" && bossCutin) {
      void bossCutin.offsetWidth;
      bossCutin.classList.add("active");
    }
    const duration = event === "chase" ? 8000 : event === "bosswin" ? 10000 : 13000;
    mascotEventEndTimer = window.setTimeout(() => {
      card.dataset.event = "none";
      bossCutin?.classList.remove("active");
      scheduleMascotEvent(card);
    }, duration);
  }, delay);
}

function renderMascotGrowth(playLoginWakeup = false) {
  const stages = [
    { min: 0, next: 3, key: "little", name: "ちび恐竜" },
    { min: 3, next: 5, key: "badge", name: "名札恐竜" },
    { min: 5, next: 10, key: "scarf", name: "スカーフ恐竜" },
    { min: 10, next: 15, key: "hat", name: "帽子恐竜" },
    { min: 15, next: 20, key: "crown", name: "王冠恐竜" },
    { min: 20, next: 30, key: "cape", name: "マント恐竜" },
    { min: 30, next: 40, key: "star", name: "スター恐竜" },
    { min: 40, next: 50, key: "sunglasses", name: "サングラス恐竜" },
    { min: 50, next: 75, key: "chef", name: "コック恐竜" },
    { min: 75, next: 100, key: "goldscarf", name: "金色スカーフ恐竜" },
    { min: 100, next: 150, key: "manager", name: "店長恐竜" },
    { min: 150, next: null, key: "legend", name: "レジェンド恐竜" },
  ] as const;
  const stage = [...stages].reverse().find((item) => submissionCount >= item.min) ?? stages[0];
  const mascot = document.getElementById("growthMascot");
  const stageEl = document.getElementById("growthStage");
  const progress = document.getElementById("growthProgress");
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const landscape = month >= 3 && month <= 5 ? "spring" : month >= 6 && month <= 8 ? "summer" : month >= 9 && month <= 11 ? "autumn" : "winter";
  let season: { key: string; label: string } | null = null;
  if (month === 10 && day >= 17) season = { key: "halloween", label: "🎃 ハロウィン衣装中" };
  else if (month === 12 && day >= 11 && day <= 25) season = { key: "christmas", label: "🎄 クリスマス衣装中" };
  else if ((month === 12 && day >= 26) || (month === 1 && day <= 7)) season = { key: "newyear", label: "🎍 お正月衣装中" };
  if (mascot) {
    mascot.dataset.stage = stage.key;
    mascot.dataset.season = season?.key ?? "";
    mascot.dataset.landscape = landscape;
    const card = mascot.closest<HTMLElement>(".mascotGrowthCard");
    if (card) {
      card.dataset.landscape = landscape;
      const weekdayFromMonday = (now.getDay() + 6) % 7;
      const mondayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - weekdayFromMonday);
      const weekIndex = Math.floor(mondayUtc / (7 * 24 * 60 * 60 * 1000));
      card.dataset.weather = weekdayFromMonday === (weekIndex * 5 + 2) % 7 ? "rain" : "clear";
      const nighttime = now.getHours() >= 22 || now.getHours() < 5;
      card.dataset.time = nighttime ? "night" : "day";
      const sleeping = playLoginWakeup && nighttime;
      card.dataset.motion = sleeping ? "sleeping" : "walking";
      mascot.dataset.motion = sleeping ? "sleeping" : "walking";
      if (mascotWakeTimer) window.clearTimeout(mascotWakeTimer);
      if (sleeping) mascotWakeTimer = window.setTimeout(() => {
        card.dataset.motion = "walking";
        mascot.dataset.motion = "walking";
      }, 3000);
      if (playLoginWakeup) scheduleMascotEvent(card, true);
    }
  }
  if (stageEl) stageEl.textContent = stage.name;
  if (progress) progress.textContent = stage.next === null ? `累計${submissionCount}回提出・立派に育ちました！` : `累計${submissionCount}回提出・あと${stage.next - submissionCount}回で成長`;
  const seasonEl = document.getElementById("growthSeason");
  if (seasonEl) seasonEl.textContent = season?.label ?? "";
}

async function loadEmployeeAnnouncement() {
  const token = getToken();
  if (!token || !employeeAnnouncement || !employeeAnnouncementText) return;
  try {
    const response = await fetch("/api/employee/announcement", { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    const message = String(data?.announcement?.message ?? "").trim();
    employeeAnnouncementText.textContent = message;
    employeeAnnouncement.style.display = response.ok && message ? "grid" : "none";
  } catch { employeeAnnouncement.style.display = "none"; }
}

function fallbackDailyFact(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86400000);
  const daysInYear = new Date(date.getFullYear(), 1, 29).getMonth() === 1 ? 366 : 365;
  return `今日は今年の${dayOfYear}日目。あと${daysInYear - dayOfYear}日あります。`;
}

async function loadDailyFact(date = new Date()) {
  const factEl = document.getElementById("dailyFactText");
  const sourceEl = document.getElementById("dailyFactSource") as HTMLAnchorElement | null;
  if (!factEl) return;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const pageTitle = `${month}月${day}日`;
  const cacheKey = `shiftflow_daily_fact_${date.getFullYear()}-${month}-${day}`;
  factEl.textContent = "今日の豆知識を探しています…";
  if (sourceEl) sourceEl.style.display = "none";
  try {
    const cached = sessionStorage.getItem(cacheKey);
    let fact = cached ?? "";
    if (!fact) {
      const params = new URLSearchParams({ action: "parse", page: pageTitle, prop: "text", section: "1", format: "json", origin: "*" });
      const response = await fetch(`https://ja.wikipedia.org/w/api.php?${params}`);
      if (!response.ok) throw new Error(`Wikipedia ${response.status}`);
      const json = await response.json();
      const html = String(json?.parse?.text?.["*"] ?? "");
      const documentBody = new DOMParser().parseFromString(html, "text/html");
      const blocked = /殺人|死亡|死去|処刑|戦争|自殺|虐殺|事故|墜落|爆発|災害|地震|焼き討ち/;
      const candidates = [...documentBody.querySelectorAll("li")]
        .map((item) => (item.textContent ?? "").replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim())
        .filter((text) => text.length >= 24 && text.length <= 125 && !blocked.test(text));
      if (!candidates.length) throw new Error("No suitable fact");
      fact = candidates[(date.getFullYear() + month * 31 + day) % candidates.length];
      sessionStorage.setItem(cacheKey, fact);
    }
    factEl.textContent = `${pageTitle}はこんな日：${fact}`;
    if (sourceEl) {
      sourceEl.href = `https://ja.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`;
      sourceEl.style.display = "inline-flex";
    }
  } catch {
    factEl.textContent = fallbackDailyFact(date);
  }
}

function showSubmissionSuccess(employeeName: string, data: ShiftData, comment: string, mode: "submitted" | "updated" = "submitted") {
  if (!successOverlay) return;
  const messages = submissionMessages(new Date(), totalShiftMinutes(data), comment);
  const title = document.getElementById("submissionSuccessTitle");
  const greeting = document.getElementById("successGreeting");
  const hours = document.getElementById("successHours");
  const totalMessage = document.getElementById("successTotalMessage");
  const keyword = document.getElementById("successKeywordMessage");
  if (title) title.textContent = mode === "updated" ? "再提出完了" : "提出完了";
  if (greeting) greeting.textContent = `${employeeName}さん、${messages.greeting}`;
  if (hours) hours.textContent = messages.hoursText;
  if (totalMessage) totalMessage.textContent = messages.total;
  if (keyword) {
    keyword.textContent = messages.keyword ?? "";
    keyword.style.display = messages.keyword ? "block" : "none";
  }
  successOverlay.style.display = "flex";
  void loadDailyFact();
}

document.getElementById("successCloseBtn")?.addEventListener("click", () => {
  if (successOverlay) successOverlay.style.display = "none";
});
document.getElementById("successCalendarBtn")?.addEventListener("click", () => {
  if (successOverlay) successOverlay.style.display = "none";
  employeeCalendar?.scrollIntoView({ behavior: "smooth", block: "start" });
});
//-------


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
      <div><b>祝日</b>: 自動判定</div>
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

function applyBusinessHoursToTimeInputs(storeId: string) {
  const def = currentBusinessHours ?? BUSINESS_HOURS[storeId as StoreId];
  if (!def) return;

  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

  days.forEach((day) => {
    const bounds = getShiftBounds(storeId, day, holidayDays.has(day), def);
    if (!bounds) return;
    document.querySelectorAll<HTMLSelectElement>(`select[data-day="${day}"][data-kind]`).forEach((element) => {
      const previousValue = element.value;
      const kind = element.dataset.kind === "end" ? "end" : "start";
      const options = timeOptions(bounds.minMinutes, bounds.maxMinutes, kind);
      element.innerHTML = `<option value="">${kind === "start" ? "開始" : "終了"}</option>` +
        options.map((value) => `<option value="${value}">${value}</option>`).join("");
      element.value = options.includes(previousValue) ? previousValue : "";
    });
  });

  // ★表示用：defのcloseをそのまま
  if (hoursPreview) {
    const w = def.weekday, h = def.weekendHoliday;
    hoursPreview.textContent =
      `営業時間（平日 ${w.open}~${w.close} / 金土日祝 ${h.open}~${h.close}）` +
      `／入力は閉店1時間後まで（最長24:30）。祝日は日ごとに自動判定します`;
  }
}

async function refreshSchedule() {
  if (!currentEmployee || !weekStartInput.value) return;
  const response = await fetch(`/api/business-hours?store_id=${encodeURIComponent(currentEmployee.store_id)}&week_start=${encodeURIComponent(weekStartInput.value)}`);
  const data = await response.json().catch(() => null);
  currentBusinessHours = data?.ok ? data.hours : BUSINESS_HOURS[currentEmployee.store_id as StoreId] ?? null;
  holidayDates = new Map(
    (Array.isArray(data?.holidays) ? data.holidays : []).map((holiday: { date: string; name: string }) => [holiday.date, holiday.name]),
  );
  holidayDays = new Set();
  const [year, month, day] = weekStartInput.value.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  DAY_KEYS.forEach((dayKey, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    if (holidayDates.has(toISODate(date))) holidayDays.add(dayKey);
  });
  applyBusinessHoursToTimeInputs(currentEmployee.store_id);
  updateDayDatesByInputs(weekStartInput.value);
}

//削除ボタン
function clearDay(day: DayKey) {
  document.querySelectorAll<HTMLSelectElement>(
    `select[data-day="${day}"][data-kind]`
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
    saveDraft();
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

function updateSubmissionStateUI() {
  const submitBtn = shiftForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;
  const locked = submissionState === "updated";
  const deadlineBlocked = Boolean(weekStartInput.value && isAfterDeadline(weekStartInput.value));

  shiftArea?.querySelectorAll<HTMLSelectElement | HTMLTextAreaElement>("select[data-day], textarea").forEach((control) => {
    control.disabled = locked;
  });

  if (submitBtn) {
    submitBtn.disabled = locked || deadlineBlocked;
    submitBtn.textContent = submissionState === "submitted"
      ? "修正内容を確認する"
      : locked
        ? "提出済み（修正上限）"
        : "入力内容を確認する";
  }

  if (!submitStatusEl) return;
  submitStatusEl.className = "submissionStateMessage";
  if (submissionState === "submitted") {
    submitStatusEl.textContent = "提出済みです。修正はあと1回できます。再提出すると、この週は以後変更できません。";
    submitStatusEl.classList.add("isEditable");
  } else if (locked) {
    submitStatusEl.textContent = "再提出済みです。この週はもう提出できません。変更が必要な場合は店長へ連絡してください。";
    submitStatusEl.classList.add("isLocked");
  } else {
    submitStatusEl.textContent = "";
  }
}

function applyDeadlineUI(weekStartYMD: string) {
  const deadline = getDeadlineForWeekStart(weekStartYMD);

  const line = document.getElementById("deadlineLine");
  const warn = document.getElementById("deadlineWarn");
  const submitBtn = shiftForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;


  if (line) {
    // 「木曜0:00で締切」を分かりやすく
    const limit = new Date(deadline.getTime() - 1); // 水曜23:59:59相当の見せ方
    line.textContent = `提出期限：${formatJP(limit)} まで（木曜0:00で締切）`;
  }

  const blocked = isAfterDeadline(weekStartYMD);

  if (submitBtn) submitBtn.disabled = blocked || submissionState === "updated";

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
  const inputs = document.querySelectorAll<HTMLSelectElement>(
    'select[data-day][data-kind]'
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
    submission_count: Number(json.submission_count ?? 0),
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

  if (!employee_id || !isEmployeeIdFormat(employee_id)) return setAuthMsg("従業員番号は8桁（湖西は9桁）で入力してね");
  if (!pin || !/^\d{4}$/.test(pin)) return setAuthMsg("PINは4桁で入力してね");
  

  if (employeeLoginButton) { employeeLoginButton.disabled = true; employeeLoginButton.textContent = "確認中…"; }
  const result = await employeeLogin(employee_id, pin).catch(() => ({ ok: false as const, error: "通信に失敗しました。もう一度試してください" }));
  if (!result.ok) {
    setAuthMsg(result.error);
    if (employeeLoginButton) { employeeLoginButton.disabled = false; employeeLoginButton.textContent = "ログイン"; }
    return
  };
  
  //token保存
  localStorage.setItem(EMP_TOKEN_KEY, result.token);

  currentEmployee = {
    employee_id,
    employee_name: result.employee_name,
    store_id: result.store_id,
  };
  submissionCount = result.submission_count;
  renderMascotGrowth(true);

  const transitionStarted = performance.now();
  if (loginTransitionOverlay) loginTransitionOverlay.style.display = "flex";
  try {
    await refreshSchedule().catch((error) => console.error("refreshSchedule error:", error));
    setAuthMsg(`ログインしました: ${result.employee_name}`);
    setLoginUserLabell(`${result.employee_name} (${result.store_id})`);
    await loadExistingSubmissionIfAny().catch((error) => console.error("loadExistingSubmission error:", error));
    await loadEmployeeCalendar().catch((error) => console.error("loadEmployeeCalendar error:", error));
    await loadEmployeeAnnouncement();
    const remaining = Math.max(0, 700 - (performance.now() - transitionStarted));
    if (remaining) await new Promise((resolve) => window.setTimeout(resolve, remaining));
    updateAuthUI();
  } finally {
    if (loginTransitionOverlay) loginTransitionOverlay.style.display = "none";
    if (employeeLoginButton) { employeeLoginButton.disabled = false; employeeLoginButton.textContent = "ログイン"; }
  }
}

function handleEmployeeLogout() {
  clearToken();
  currentEmployee = null;
  submissionCount = 0;
  if (employeeAnnouncement) employeeAnnouncement.style.display = "none";

  // 入力系（optional chaining で代入しない）
  const pinInput = getEl<HTMLInputElement>("pinInput");
  if (pinInput) pinInput.value = "";

  // 従業員番号
  const empIdInput = getEl<HTMLInputElement>("employeeId");
  if (empIdInput) empIdInput.value = "";

  if (commentEl) { commentEl.value = ""; updateCommentCount(); }
  currentBusinessHours = null;
  holidayDates.clear();
  holidayDays.clear();

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
    const startEl = document.querySelector<HTMLSelectElement>(
      `select[data-day=${day}][data-kind="start"]`
    );
    const endEl = document.querySelector<HTMLSelectElement>(
      `select[data-day="${day}"][data-kind="end"]`
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
      const start = (s ?? "").trim();
      const end = (e ?? "").trim();
      if (start && !Array.from(startEl.options).some((option) => option.value === start)) {
        startEl.add(new Option(`${start}（以前の入力）`, start));
      }
      if (end && !Array.from(endEl.options).some((option) => option.value === end)) {
        endEl.add(new Option(`${end}（以前の入力）`, end));
      }
      startEl.value = start;
      endEl.value = end;
    } else {
      //片方だけ入ってるケースは strat に入れておく
      startEl.value = v;
      endEl.value = "";
    }

  });
}

async function loadExistingSubmissionIfAny() {
  hasExistingSubmission = false;
  submissionState = "none";
  updateSubmissionStateUI();

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
      submissionState = "none";
      updateSubmissionStateUI();
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
    submissionState = "none";
    updateSubmissionStateUI();
    clearShiftInputs();
    restoreDraft();
    return;
  }

  //ここまで来たら「既存あり」
  hasExistingSubmission = true;
  submissionState = submission.status === "updated" ? "updated" : "submitted";
  updateSubmissionStateUI();

  if (commentEl) {
    commentEl.value = submission.comment ?? "";
    updateCommentCount();
  }

  applyBusinessHoursToInputs(submission.data ?? {});
  updateShiftSimulator();
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

let currentEmployee: CurrentEmployee | null = null;

const DRAFT_VERSION = 1;

function draftKey() {
  if (!currentEmployee || !weekStartInput.value) return null;
  return `shiftflow_draft_v${DRAFT_VERSION}:${currentEmployee.employee_id}:${weekStartInput.value}`;
}

function saveDraft() {
  const key = draftKey();
  if (!key || hasExistingSubmission) return;
  const data = collectShiftData();
  const comment = commentEl?.value ?? "";
  const hasContent = Object.values(data).some(Boolean) || Boolean(comment.trim());
  if (!hasContent) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify({ data, comment, savedAt: new Date().toISOString() }));
}

function restoreDraft() {
  const key = draftKey();
  if (!key) return;
  try {
    const draft = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!draft?.data) return;
    applyBusinessHoursToInputs(draft.data);
    updateShiftSimulator();
    if (commentEl) commentEl.value = String(draft.comment ?? "").slice(0, 300);
    updateCommentCount();
    const status = document.getElementById("submitStatus");
    if (status) status.textContent = "保存していた下書きを復元しました";
  } catch {
    localStorage.removeItem(key);
  }
}

function clearDraft() {
  const key = draftKey();
  if (key) localStorage.removeItem(key);
}

document.querySelectorAll<HTMLSelectElement>('select[data-day][data-kind]').forEach((select) => {
  select.addEventListener("change", () => { saveDraft(); updateShiftSimulator(); });
});
commentEl?.addEventListener("input", saveDraft);

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
    is_holiday: false,
    comment: (commentEl?.value ?? "").trim(),
    mode: hasExistingSubmission ? "update" : "submitted",
  };

  const ok = await openConfirm(payload);
  if (!ok) return;

  if (!validateShiftData(payload.data)) return;

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
      if (res.status === 409) {
        submissionState = "updated";
        hasExistingSubmission = true;
        updateSubmissionStateUI();
      }
      alert(`送信に失敗しました: ${json?.error ?? `HTTP ${res.status}`}`);
      return;
    }

    const savedMode = json.mode === "updated" ? "updated" : "submitted";
    if (savedMode === "submitted") { submissionCount += 1; renderMascotGrowth(); }
    showSubmissionSuccess(currentEmployee.employee_name, payload.data, payload.comment, savedMode);

    clearDraft();
    await loadExistingSubmissionIfAny();
  } finally {
    isSubmitting = false;
    updateSubmissionStateUI();
  }
});



//従業員が切り替わった時に全入力クリア⇨既存提出があれば上書き
function clearShiftInputs() {
  const days = ["mon","tue","wed","thu","fri","sat","sun"] as const;

  days.forEach((day) => {
    const startEl = document.querySelector<HTMLSelectElement>(
      `select[data-day="${day}"][data-kind="start"]`
    );
    const endEl = document.querySelector<HTMLSelectElement>(
      `select[data-day="${day}"][data-kind="end"]`
    );
    if (startEl) startEl.value = "";
    if (endEl) endEl.value = "";
  });

  updatePreview({}); 
  updateShiftSimulator();
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

    isNormalizingWeek = false;
  }

  await refreshSchedule();
  updateWeekLabel(weekStartInput.value);

  //週が確定したら既存提出を読み込む
  await loadExistingSubmissionIfAny();
});

initWeekStart();
