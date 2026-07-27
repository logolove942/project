import type { NextFunction, Request, Response } from "express";
import { NotFoundError, ValidationError } from "../domain/errors.js";

// 中央錯誤處理：找不到 -> 404、驗證失敗／不合法轉換 -> 400、其餘 -> 500。
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
