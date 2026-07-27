// 沿用後端 taskService.ts 的 today() 慣例：YYYY-MM-DD，用來判斷「今天剛完成」（ADR-0002）。
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// YYYY-MM，給 GET /stats/monthly 用的月份參數。
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
