import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isOrderDate, localDateKey, nextOrderDate } from "../src/inventory/order-date";

describe("order date selection", () => {
  it("keeps the current day when it is a recurring order day", () => {
    assert.equal(nextOrderDate([1, 4], [], new Date("2026-11-12T09:00:00+09:00")), "2026-11-12");
  });

  it("finds the next recurring day for Hamakita", () => {
    assert.equal(nextOrderDate([1, 4], [], new Date("2026-11-13T09:00:00+09:00")), "2026-11-16");
  });

  it("uses a one-day override before the next recurring day", () => {
    assert.equal(nextOrderDate([1, 4], ["2026-11-14"], new Date("2026-11-13T09:00:00+09:00")), "2026-11-14");
    assert.equal(isOrderDate("2026-11-14", [1, 4], ["2026-11-14"]), true);
  });

  it("does not mistake an ordinary day for an order day", () => {
    assert.equal(isOrderDate("2026-11-13", [1, 4]), false);
    assert.equal(isOrderDate("invalid", [1, 4]), false);
  });

  it("formats dates in local time instead of UTC", () => {
    assert.equal(localDateKey(new Date(2026, 10, 13, 0, 5)), "2026-11-13");
  });
});
