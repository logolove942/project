import { beforeEach, describe, expect, it } from "vitest";
import { createAccountService, type AccountService } from "./accountService.js";
import { ValidationError } from "./errors.js";

describe("accountService - 帳號註冊與清單（issue #45）", () => {
  let service: AccountService;

  beforeEach(() => {
    service = createAccountService();
  });

  it("registers an account and returns it without any password material", () => {
    const account = service.register("小美", "hunter2");
    expect(account.name).toBe("小美");
    expect(account.id).toBeTruthy();
    expect(account).not.toHaveProperty("password");
    expect(account).not.toHaveProperty("passwordHash");
    expect(account).not.toHaveProperty("salt");
  });

  it("makes the very first registered account 管理職", () => {
    const first = service.register("我", "pw1");
    expect(first.role).toBe("管理職");
  });

  it("makes subsequent registered accounts 一般同仁", () => {
    service.register("我", "pw1");
    const second = service.register("小美", "pw2");
    const third = service.register("阿凱", "pw3");
    expect(second.role).toBe("一般同仁");
    expect(third.role).toBe("一般同仁");
  });

  it("rejects registering a name that is already taken", () => {
    service.register("小美", "pw1");
    expect(() => service.register("小美", "different-password")).toThrowError(ValidationError);
  });

  it("rejects registering with an empty name or password", () => {
    expect(() => service.register("", "pw")).toThrowError(ValidationError);
    expect(() => service.register("小美", "")).toThrowError(ValidationError);
  });

  it("lists all registered accounts without password material", () => {
    service.register("我", "pw1");
    service.register("小美", "pw2");
    const accounts = service.listAccounts();
    expect(accounts.map((a) => a.name).sort()).toEqual(["小美", "我"]);
    for (const account of accounts) {
      expect(account).not.toHaveProperty("passwordHash");
      expect(account).not.toHaveProperty("salt");
    }
  });

  it("verifies correct credentials", () => {
    const registered = service.register("小美", "hunter2");
    const verified = service.verifyCredentials("小美", "hunter2");
    expect(verified).toEqual(registered);
  });

  it("rejects incorrect password", () => {
    service.register("小美", "hunter2");
    expect(service.verifyCredentials("小美", "wrong-password")).toBeUndefined();
  });

  it("rejects an unknown account name", () => {
    expect(service.verifyCredentials("不存在的人", "whatever")).toBeUndefined();
  });

  it("getAccount throws NotFoundError for an unknown id", () => {
    expect(() => service.getAccount("missing-id")).toThrowError();
  });

  it("getAccount returns the account for a known id", () => {
    const registered = service.register("小美", "hunter2");
    expect(service.getAccount(registered.id)).toEqual(registered);
  });

  it("promotes a 一般同仁 account to 管理職", () => {
    service.register("我", "pw1");
    const member = service.register("小美", "pw2");
    expect(member.role).toBe("一般同仁");

    const promoted = service.promote(member.id);
    expect(promoted.role).toBe("管理職");
    expect(service.getAccount(member.id).role).toBe("管理職");
  });

  it("promote throws NotFoundError for an unknown id", () => {
    expect(() => service.promote("missing-id")).toThrowError();
  });
});
