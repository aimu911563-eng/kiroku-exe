import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MASCOT_EMOTES, MASCOT_ITEMS, mascotUnlockAvailable } from "./mascot-unlocks";

describe("mascot unlocks", () => {
  it("provides six items and six emotes", () => {
    assert.equal(MASCOT_ITEMS.length, 6);
    assert.equal(MASCOT_EMOTES.length, 6);
  });

  it("unlocks rewards only from their matching stat", () => {
    const shades = MASCOT_ITEMS.find((item) => item.id === "cool_shades")!;
    assert.equal(mascotUnlockAvailable(shades, { coolness: 2, cuteness: 20, beauty: 20 }), false);
    assert.equal(mascotUnlockAvailable(shades, { coolness: 3, cuteness: 0, beauty: 0 }), true);
  });
});
