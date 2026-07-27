import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createDatabase, nextId, type DatabaseSync } from "./database.js";
import { NotFoundError, ValidationError } from "./errors.js";

// 兩種角色，沿用 CONTEXT.md 既有詞彙；管理職專屬操作見 issue #47。
export type Role = "管理職" | "一般同仁";

// 對外一律不帶密碼雜湊/salt——GET /accounts 與註冊回應都只能看到這個形狀。
export interface Account {
  id: string;
  name: string;
  role: Role;
}

interface AccountRow {
  id: string;
  name: string;
  password_hash: string;
  salt: string;
  role: string;
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function createAccountService(db: DatabaseSync = createDatabase()) {
  function rowToAccount(row: AccountRow): Account {
    return { id: row.id, name: row.name, role: row.role as Role };
  }

  function findRowByName(name: string): AccountRow | undefined {
    return db.prepare("SELECT * FROM accounts WHERE name = ?").get(name) as unknown as
      | AccountRow
      | undefined;
  }

  function countAccounts(): number {
    const row = db.prepare("SELECT COUNT(*) as count FROM accounts").get() as unknown as {
      count: number;
    };
    return row.count;
  }

  // 第一個註冊的帳號自動成為管理職，之後預設為一般同仁；名稱重複拒絕（issue #45）。
  function register(name: string, password: string): Account {
    if (!name || !password) {
      throw new ValidationError("Name and password are required");
    }
    if (findRowByName(name)) {
      throw new ValidationError(`Account name already taken: ${name}`);
    }
    const role: Role = countAccounts() === 0 ? "管理職" : "一般同仁";
    const salt = randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, salt);
    const id = nextId(db, "account");
    db.prepare("INSERT INTO accounts (id, name, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)").run(
      id,
      name,
      passwordHash,
      salt,
      role,
    );
    return { id, name, role };
  }

  function listAccounts(): Account[] {
    const rows = db.prepare("SELECT * FROM accounts ORDER BY rowid").all() as unknown as AccountRow[];
    return rows.map(rowToAccount);
  }

  function getAccount(id: string): Account {
    const row = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as unknown as
      | AccountRow
      | undefined;
    if (!row) throw new NotFoundError(`Account not found: ${id}`);
    return rowToAccount(row);
  }

  // 密碼錯誤或帳號不存在都回傳 undefined（同一種結果），呼叫端負責轉換成通用錯誤訊息（issue #46）。
  function verifyCredentials(name: string, password: string): Account | undefined {
    const row = findRowByName(name);
    if (!row) return undefined;
    const candidate = Buffer.from(hashPassword(password, row.salt), "hex");
    const stored = Buffer.from(row.password_hash, "hex");
    if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) return undefined;
    return rowToAccount(row);
  }

  // 管理職專屬操作：把指定帳號的角色設為管理職（issue #47）。
  function promote(id: string): Account {
    getAccount(id);
    db.prepare("UPDATE accounts SET role = ? WHERE id = ?").run("管理職", id);
    return getAccount(id);
  }

  return { register, listAccounts, getAccount, verifyCredentials, promote };
}

export type AccountService = ReturnType<typeof createAccountService>;
