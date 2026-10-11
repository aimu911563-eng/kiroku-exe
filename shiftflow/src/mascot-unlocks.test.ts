import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MASCOT_EMOTES, MASCOT_ITEMS, mascotUnlockAvailable } from "./mascot-unlocks";

describe("mascot unlocks", () => {
  it("provides stat and submission rewards", () => {
    assert.equal(MASCOT_ITEMS.length, 9);
    assert.equal(MASCOT_EMOTES.length, 9);
  });

  it("unlocks rewards only from their matching stat", () => {
    const shades = MASCOT_ITEMS.find((item) => item.id === "cool_shades")!;
    assert.equal(mascotUnlockAvailable(shades, { coolness: 2, cuteness: 20, beauty: 20 }), false);
    assert.equal(mascotUnlockAvailable(shades, { coolness: 3, cuteness: 0, beauty: 0 }), true);
  });

  it("keeps submission rewards locked until their milestone", () => {
    const crown = MASCOT_ITEMS.find((item) => item.id === "submit_crown")!;
    const stats = { coolness: 99, cuteness: 99, beauty: 99 };
    assert.equal(mascotUnlockAvailable(crown, stats, 49), false);
    assert.equal(mascotUnlockAvailable(crown, stats, 50), true);
  });
});
