export type JapaneseHoliday = { date: string; name: string };

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function nthMonday(year: number, month: number, nth: number) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  return 1 + ((8 - firstDay) % 7) + (nth - 1) * 7;
}

function addDay(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year, month - 1, day);
  value.setDate(value.getDate() + days);
  return iso(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

/** Modern Japanese national holidays (valid for the years used by ShiftFlow). */
export function japaneseHolidays(year: number): JapaneseHoliday[] {
  const holidays = new Map<string, string>();
  const add = (month: number, day: number, name: string) => holidays.set(iso(year, month, day), name);

  add(1, 1, "元日");
  add(1, nthMonday(year, 1, 2), "成人の日");
  add(2, 11, "建国記念の日");
  add(2, 23, "天皇誕生日");
  add(3, Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)), "春分の日");
  add(4, 29, "昭和の日");
  add(5, 3, "憲法記念日");
  add(5, 4, "みどりの日");
  add(5, 5, "こどもの日");
  add(7, nthMonday(year, 7, 3), "海の日");
  add(8, 11, "山の日");
  add(9, nthMonday(year, 9, 3), "敬老の日");
  add(9, Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)), "秋分の日");
  add(10, nthMonday(year, 10, 2), "スポーツの日");
  add(11, 3, "文化の日");
  add(11, 23, "勤労感謝の日");

  // A weekday between two national holidays is also a holiday.
  for (let cursor = iso(year, 1, 2); cursor < iso(year + 1, 1, 1); cursor = addDay(cursor, 1)) {
    if (!holidays.has(cursor) && holidays.has(addDay(cursor, -1)) && holidays.has(addDay(cursor, 1))) {
      holidays.set(cursor, "国民の休日");
    }
  }

  // A holiday on Sunday is observed on the next non-holiday weekday.
  for (const [date] of [...holidays]) {
    const [y, m, d] = date.split("-").map(Number);
    if (new Date(y, m - 1, d).getDay() !== 0) continue;
    let substitute = addDay(date, 1);
    while (holidays.has(substitute)) substitute = addDay(substitute, 1);
    holidays.set(substitute, "振替休日");
  }

  return [...holidays].sort(([a], [b]) => a.localeCompare(b)).map(([date, name]) => ({ date, name }));
}

export function holidaysForWeek(weekStart: string) {
  const [year, month, day] = weekStart.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const years = new Set([start.getFullYear(), end.getFullYear()]);
  const startISO = iso(start.getFullYear(), start.getMonth() + 1, start.getDate());
  const endISO = iso(end.getFullYear(), end.getMonth() + 1, end.getDate());
  return new Map(
    [...years]
      .flatMap((value) => japaneseHolidays(value))
      .filter((holiday) => holiday.date >= startISO && holiday.date <= endISO)
      .map((holiday) => [holiday.date, holiday.name]),
  );
}
