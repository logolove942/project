import { randomBytes } from "node:crypto";
import { createDatabase, type DatabaseSync } from "./database.js";

// 不透明的 session token；沒有到期機制，登出是唯一讓 token 失效的方式（issue #46）。
export function createSessionService(db: DatabaseSync = createDatabase()) {
  function createSession(accountId: string): string {
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions (token, account_id) VALUES (?, ?)").run(token, accountId);
    return token;
  }

  function resolveToken(token: string): string | undefined {
    const row = db.prepare("SELECT account_id FROM sessions WHERE token = ?").get(token) as unknown as
      | { account_id: string }
      | undefined;
    return row?.account_id;
  }

  function invalidate(token: string): void {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }

  return { createSession, resolveToken, invalidate };
}

export type SessionService = ReturnType<typeof createSessionService>;
