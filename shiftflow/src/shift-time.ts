export type ShiftDayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type StoreId = "terajima" | "kosai" | "hamakita" | "demo";
export type BusinessHoursDefinition = {
  weekday: { open: string; close: string };
  weekendHoliday: { open: string; close: string };
};

export const BUSINESS_HOURS: Record<StoreId, BusinessHoursDefinition> = {
  terajima: { weekday: { open: "10:00", close: "23:00" }, weekendHoliday: { open: "10:00", close: "24:00" } },
  hamakita: { weekday: { open: "10:00", close: "21:00" }, weekendHoliday: { open: "10:00", close: "22:00" } },
  kosai: { weekday: { open: "15:00", close: "22:00" }, weekendHoliday: { open: "10:00", close: "22:00" } },
  demo: { weekday: { open: "10:00", close: "23:00" }, weekendHoliday: { open: "10:00", close: "24:00" } },
};

export const LATEST_SHIFT_MINUTES = 24 * 60 + 30;

export function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const total = hours * 60 + minutes;
  if (minutes < 0 || minutes >= 60 || total < 0 || total > LATEST_SHIFT_MINUTES) return null;
  return total;
}

export function minutesToTime(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function isWeekendOrFriday(day: ShiftDayKey) {
  return day === "fri" || day === "sat" || day === "sun";
}

export function getShiftBounds(
  storeId: string,
  day: ShiftDayKey,
  isHoliday: boolean,
  customHours?: BusinessHoursDefinition,
) {
  const definition = customHours ?? BUSINESS_HOURS[storeId as StoreId];
  if (!definition) return null;
  const rule = isWeekendOrFriday(day) || isHoliday
    ? definition.weekendHoliday
    : definition.weekday;
  const openMinutes = timeToMinutes(rule.open)!;
  const closeMinutes = timeToMinutes(rule.close)!;
  return {
    open: rule.open,
    close: rule.close,
    minMinutes: openMinutes,
    maxMinutes: Math.min(closeMinutes + 60, LATEST_SHIFT_MINUTES),
  };
}

export function timeOptions(minMinutes: number, maxMinutes: number, kind: "start" | "end") {
  const first = kind === "start" ? minMinutes : minMinutes + 15;
  const last = kind === "start" ? maxMinutes - 15 : maxMinutes;
  const result: string[] = [];
  for (let minutes = first; minutes <= last; minutes += 15) result.push(minutesToTime(minutes));
  return result;
}

export function validateShiftDataForStore(
  storeId: string,
  data: Record<string, string>,
  holidayDays: ReadonlySet<ShiftDayKey> | boolean,
  customHours?: BusinessHoursDefinition,
): string | null {
  const days: ShiftDayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  for (const day of days) {
    const value = String(data[day] ?? "").trim();
    if (!value) continue;
    const match = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(value);
    if (!match) return `${day}: 開始時間と終了時間を選択してください`;
    if ([match[1], match[2]].some((time) => Number(time.slice(3)) % 15 !== 0)) {
      return `${day}: 時間は15分単位で選択してください`;
    }
    const start = timeToMinutes(match[1]);
    const end = timeToMinutes(match[2]);
    const isHoliday = typeof holidayDays === "boolean" ? holidayDays : holidayDays.has(day);
    const bounds = getShiftBounds(storeId, day, isHoliday, customHours);
    if (start === null || end === null) return `${day}: 入力可能な最終時刻は24:30です`;
    if (!bounds) return "店舗の営業時間設定が見つかりません";
    if (start < bounds.minMinutes || end > bounds.maxMinutes) {
      return `${day}: 入力可能時間は${bounds.open}〜${minutesToTime(bounds.maxMinutes)}です`;
    }
    if (start >= end) return `${day}: 終了時間は開始時間より後にしてください`;
  }
  return null;
}
