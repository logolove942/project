// 找不到指定的實體（需求/規格/任務/提醒/待辦項目等）。
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

// 輸入不合法，或狀態轉換不符合規則（例如任務不在可以退件的狀態）。
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
