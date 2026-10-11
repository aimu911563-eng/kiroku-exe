export const MASCOT_MAX_LEVEL = 100;

export type MascotLevelRow = {
  level: number;
  totalXp: number;
  xpToNext: number | null;
};

// A deliberately long-term curve: early levels arrive quickly, while each
// later level costs 50 XP more than the one before it.
export const MASCOT_LEVEL_TABLE: readonly MascotLevelRow[] = Array.from(
  { length: MASCOT_MAX_LEVEL },
  (_, index) => {
    const level = index + 1;
    const totalXp = 25 * index * index;
    const nextTotalXp = level < MASCOT_MAX_LEVEL ? 25 * level * level : null;
    return {
      level,
      totalXp,
      xpToNext: nextTotalXp === null ? null : nextTotalXp - totalXp,
    };
  },
);

export function mascotLevelForXp(xp: number) {
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  for (let index = MASCOT_LEVEL_TABLE.length - 1; index >= 0; index -= 1) {
    if (safeXp >= MASCOT_LEVEL_TABLE[index].totalXp) return MASCOT_LEVEL_TABLE[index];
  }
  return MASCOT_LEVEL_TABLE[0];
}

