export type MascotStatKey = "coolness" | "cuteness" | "beauty";

export type MascotUnlock = {
  id: string;
  name: string;
  stat: MascotStatKey;
  required: number;
  icon: string;
};

export const MASCOT_ITEMS: readonly MascotUnlock[] = [
  { id: "cool_shades", name: "黒サングラス", stat: "coolness", required: 3, icon: "▰" },
  { id: "cool_aura", name: "ブルーオーラ", stat: "coolness", required: 10, icon: "⚡" },
  { id: "cute_ribbon", name: "ピンクリボン", stat: "cuteness", required: 3, icon: "🎀" },
  { id: "cute_hearts", name: "ハートオーラ", stat: "cuteness", required: 10, icon: "♡" },
  { id: "beauty_gem", name: "空色の宝石", stat: "beauty", required: 3, icon: "◆" },
  { id: "beauty_sparkle", name: "きらめきオーラ", stat: "beauty", required: 10, icon: "✦" },
];

export const MASCOT_EMOTES: readonly MascotUnlock[] = [
  { id: "cool_pose", name: "キメポーズ", stat: "coolness", required: 5, icon: "😎" },
  { id: "cool_dash", name: "高速ダッシュ", stat: "coolness", required: 20, icon: "💨" },
  { id: "cute_wave", name: "手をふる", stat: "cuteness", required: 5, icon: "👋" },
  { id: "cute_hop", name: "うれしいジャンプ", stat: "cuteness", required: 20, icon: "♪" },
  { id: "beauty_turn", name: "くるりと回る", stat: "beauty", required: 5, icon: "✨" },
  { id: "beauty_shine", name: "スポットライト", stat: "beauty", required: 20, icon: "🌟" },
];

export function mascotUnlockAvailable(unlock: MascotUnlock, stats: Record<MascotStatKey, number>) {
  return stats[unlock.stat] >= unlock.required;
}
