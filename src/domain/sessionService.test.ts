import { beforeEach, describe, expect, it } from "vitest";
import { createSessionService, type SessionService } from "./sessionService.js";

describe("sessionService - session token（issue #46）", () => {
  let service: SessionService;

  beforeEach(() => {
    service = createSessionService();
  });

  it("resolves a freshly created session back to its account id", () => {
    const token = service.createSession("account-1");
    expect(service.resolveToken(token)).toBe("account-1");
  });

  it("returns undefined for an unknown token", () => {
    expect(service.resolveToken("not-a-real-token")).toBeUndefined();
  });

  it("invalidates a token so it no longer resolves (logout)", () => {
    const token = service.createSession("account-1");
    service.invalidate(token);
    expect(service.resolveToken(token)).toBeUndefined();
  });

  it("issues distinct tokens for repeated sessions of the same account", () => {
    const first = service.createSession("account-1");
    const second = service.createSession("account-1");
    expect(first).not.toBe(second);
    expect(service.resolveToken(first)).toBe("account-1");
    expect(service.resolveToken(second)).toBe("account-1");
  });
});
