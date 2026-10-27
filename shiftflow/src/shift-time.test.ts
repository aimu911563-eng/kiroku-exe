import assert from "node:assert/strict";
import test from "node:test";
import {
  getShiftBounds,
  timeOptions,
  validateShiftDataForStore,
} from "./shift-time";
import { holidaysForWeek, japaneseHolidays } from "./japanese-holidays";

test("time options use only 00, 15, 30 and 45 minutes", () => {
  const options = timeOptions(10 * 60, 24 * 60 + 30, "end");
  assert.equal(options.at(-1), "24:30");
  assert.ok(options.every((value) => /:(00|15|30|45)$/.test(value)));
});

test("Terajima Friday supports closing work through 24:30", () => {
  const bounds = getShiftBounds("terajima", "fri", false);
  assert.equal(bounds?.close, "24:00");
  assert.equal(bounds?.maxMinutes, 24 * 60 + 30);
  assert.equal(validateShiftDataForStore("terajima", { fri: "24:00-24:30" }, false), null);
});

test("each store keeps its configured hours", () => {
  assert.match(validateShiftDataForStore("hamakita", { mon: "09:45-10:15" }, false) ?? "", /10:00/);
  assert.match(validateShiftDataForStore("hamakita", { mon: "21:45-22:15" }, false) ?? "", /22:00/);
  assert.equal(validateShiftDataForStore("kosai", { mon: "15:00-23:00" }, false), null);
});

test("server validation rejects non-quarter and times after 24:30", () => {
  assert.match(validateShiftDataForStore("terajima", { fri: "17:05-20:00" }, false) ?? "", /15分/);
  assert.match(validateShiftDataForStore("terajima", { fri: "24:15-24:45" }, false) ?? "", /24:30/);
});

test("Japanese holidays are detected per day", () => {
  const holidays = holidaysForWeek("2026-05-04");
  assert.equal(holidays.get("2026-05-04"), "みどりの日");
  assert.equal(holidays.get("2026-05-05"), "こどもの日");
  assert.equal(holidays.get("2026-05-06"), "振替休日");
  assert.equal(holidays.has("2026-05-07"), false);
  assert.equal(japaneseHolidays(2026).some((holiday) => holiday.date === "2026-09-22"), true);
});

test("custom store hours are used by validation", () => {
  const custom = {
    weekday: { open: "09:00", close: "20:00" },
    weekendHoliday: { open: "11:00", close: "18:00" },
  };
  assert.equal(validateShiftDataForStore("terajima", { mon: "09:00-10:00" }, new Set(), custom), null);
  assert.match(validateShiftDataForStore("terajima", { mon: "08:45-10:00" }, new Set(), custom) ?? "", /入力可能時間/);
});
