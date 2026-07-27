import type express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

export function listenOnEphemeralPort(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://localhost:${port}` });
    });
  });
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

// fetch's Response#json() types as unknown; tests just want to poke at the shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJson(res: Response): Promise<any> {
  return res.json();
}

// issue #46：既有的 API 層測試現在都要先登入拿到 token 才能打其餘路由——
// 真的呼叫 /auth/register + /auth/login（不 mock），沿用專案一貫「打真的 HTTP request」的測試風格。
export async function registerAndLogin(
  baseUrl: string,
  name = "test-user",
  password = "test-password",
): Promise<string> {
  await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password }),
  });
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password }),
  });
  const body = (await res.json()) as { token: string };
  return body.token;
}

// 幫每個 fetch 呼叫自動帶上 Authorization header，取代測試裡逐一手動拼 headers。
export function createAuthedFetch(token: string): typeof fetch {
  return ((url: string, init: RequestInit = {}) =>
    fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
    })) as typeof fetch;
}
