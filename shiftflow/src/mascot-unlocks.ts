export type MascotStatKey = "coolness" | "cuteness" | "beauty";

export type MascotUnlock = {
  id: string;
  name: string;
  stat?: MascotStatKey;
  required?: number;
  submissions?: number;
  icon: string;
};

export const MASCOT_ITEMS: readonly MascotUnlock[] = [
  { id: "cool_shades", name: "黒サングラス", stat: "coolness", required: 3, icon: "▰" },
  { id: "cool_aura", name: "ブルーオーラ", stat: "coolness", required: 10, icon: "⚡" },
  { id: "cute_ribbon", name: "ピンクリボン", stat: "cuteness", required: 3, icon: "🎀" },
  { id: "cute_hearts", name: "ハートオーラ", stat: "cuteness", required: 10, icon: "♡" },
  { id: "beauty_gem", name: "空色の宝石", stat: "beauty", required: 3, icon: "◆" },
  { id: "beauty_sparkle", name: "きらめきオーラ", stat: "beauty", required: 10, icon: "✦" },
  { id: "submit_badge", name: "皆勤バッジ", submissions: 10, icon: "🏅" },
  { id: "submit_cape", name: "ベテランマント", submissions: 25, icon: "◆" },
  { id: "submit_crown", name: "伝説の王冠", submissions: 50, icon: "♛" },
];

export const MASCOT_EMOTES: readonly MascotUnlock[] = [
  { id: "cool_pose", name: "キメポーズ", stat: "coolness", required: 5, icon: "😎" },
  { id: "cool_dash", name: "高速ダッシュ", stat: "coolness", required: 20, icon: "💨" },
  { id: "cute_wave", name: "手をふる", stat: "cuteness", required: 5, icon: "👋" },
  { id: "cute_hop", name: "うれしいジャンプ", stat: "cuteness", required: 20, icon: "♪" },
  { id: "beauty_turn", name: "くるりと回る", stat: "beauty", required: 5, icon: "✨" },
  { id: "beauty_shine", name: "スポットライト", stat: "beauty", required: 20, icon: "🌟" },
  { id: "submit_bow", name: "おじぎ", submissions: 15, icon: "🙇" },
  { id: "submit_confetti", name: "紙吹雪", submissions: 35, icon: "🎉" },
  { id: "submit_legend", name: "伝説の登場", submissions: 75, icon: "👑" },
];

export function mascotUnlockAvailable(unlock: MascotUnlock, stats: Record<MascotStatKey, number>, submissionCount = 0) {
  if (unlock.submissions !== undefined) return submissionCount >= unlock.submissions;
  return unlock.stat !== undefined && unlock.required !== undefined && stats[unlock.stat] >= unlock.required;
}
