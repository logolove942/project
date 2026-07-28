// 人員顯示共用：頭像圓圈的姓名縮寫與顏色。純函式、不依賴帳號物件的完整形狀，
// 任何地方只要有一個名字字串（owner、report 人員、指派對象……）就能用。
const AVATAR_COLORS = ["#3b5bfd", "#7038d8", "#0e9488", "#db2777", "#16a34a", "#d97706"];

export function initials(name: string): string {
  return (name || "?").slice(0, 1).toUpperCase();
}

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
