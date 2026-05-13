import { afterEach, describe, expect, test } from "vitest";
import {
  createMemorySessionStore,
  createSession,
  destroySession,
  getSession,
  rotateSession,
} from "../src/session.js";

const originalEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

function cookiePair(response: Response): string {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

describe("app-router session helpers", () => {
  test("createSession stores data and sets a development session cookie", async () => {
    process.env.NODE_ENV = "development";
    const store = createMemorySessionStore<{ userId: string }>();
    const response = new Response(null);
    const session = await createSession(response, store, { userId: "ada" });

    expect(session.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.data).toEqual({ userId: "ada" });
    expect(response.headers.get("set-cookie")).toContain("mreact.session=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(response.headers.get("set-cookie")).not.toContain("Secure");

    const request = new Request("https://app.test/", {
      headers: { cookie: cookiePair(response) },
    });
    await expect(getSession(request, store)).resolves.toMatchObject({
      data: { userId: "ada" },
      id: session.id,
    });
  });

  test("production uses __Host- prefix and Secure without Domain", async () => {
    process.env.NODE_ENV = "production";
    const store = createMemorySessionStore<{ userId: string }>();
    const response = new Response(null);
    await createSession(response, store, { userId: "ada" });
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(cookie.startsWith("__Host-mreact.session=")).toBe(true);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toMatch(/;\s*Domain=/i);
  });

  test("getSession returns undefined for missing, malformed, and expired sessions", async () => {
    const store = createMemorySessionStore<{ userId: string }>();
    expect(await getSession(new Request("https://app.test/"), store)).toBeUndefined();
    expect(
      await getSession(
        new Request("https://app.test/", { headers: { cookie: "mreact.session=%ZZ" } }),
        store,
      ),
    ).toBeUndefined();

    const response = new Response(null);
    const session = await createSession(response, store, { userId: "ada" }, { maxAgeSeconds: 1 });
    await store.set({ ...session, expiresAt: Date.now() - 1 });

    const request = new Request("https://app.test/", {
      headers: { cookie: cookiePair(response) },
    });
    expect(await getSession(request, store)).toBeUndefined();
    expect(await store.get(session.id)).toBeUndefined();
  });

  test("destroySession deletes store record and emits deletion cookie", async () => {
    const store = createMemorySessionStore<{ userId: string }>();
    const loginResponse = new Response(null);
    const session = await createSession(loginResponse, store, { userId: "ada" });
    const logoutResponse = new Response(null);
    const request = new Request("https://app.test/", {
      headers: { cookie: cookiePair(loginResponse) },
    });

    await destroySession(request, logoutResponse, store);

    expect(await store.get(session.id)).toBeUndefined();
    expect(logoutResponse.headers.get("set-cookie")).toContain("mreact.session=; Max-Age=0");
  });

  test("rotateSession replaces the id while preserving data", async () => {
    const store = createMemorySessionStore<{ userId: string }>();
    const firstResponse = new Response(null);
    const first = await createSession(firstResponse, store, { userId: "ada" });
    const rotateResponse = new Response(null);
    const request = new Request("https://app.test/", {
      headers: { cookie: cookiePair(firstResponse) },
    });

    const second = await rotateSession(request, rotateResponse, store);

    expect(second?.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second?.id).not.toBe(first.id);
    expect(second?.data).toEqual({ userId: "ada" });
    expect(await store.get(first.id)).toBeUndefined();
    expect(await store.get(second?.id ?? "")).toMatchObject({ data: { userId: "ada" } });
  });
});
