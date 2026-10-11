import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MASCOT_LEVEL_TABLE, mascotLevelForXp } from "./mascot-levels";

describe("mascot level table", () => {
  it("defines a strict 100-level progression", () => {
    assert.equal(MASCOT_LEVEL_TABLE.length, 100);
    assert.deepEqual(MASCOT_LEVEL_TABLE[0], { level: 1, totalXp: 0, xpToNext: 25 });
    assert.deepEqual(MASCOT_LEVEL_TABLE[9], { level: 10, totalXp: 2025, xpToNext: 475 });
    assert.deepEqual(MASCOT_LEVEL_TABLE[49], { level: 50, totalXp: 60025, xpToNext: 2475 });
    assert.deepEqual(MASCOT_LEVEL_TABLE[99], { level: 100, totalXp: 245025, xpToNext: null });
  });

  it("finds the current level from cumulative XP", () => {
    assert.equal(mascotLevelForXp(-1).level, 1);
    assert.equal(mascotLevelForXp(24).level, 1);
    assert.equal(mascotLevelForXp(25).level, 2);
    assert.equal(mascotLevelForXp(245025).level, 100);
    assert.equal(mascotLevelForXp(999999).level, 100);
  });
});
