import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createMemorySessionStore,
  createSession,
  destroySession,
  getSession,
  rotateSession,
} from "../src/session.js";

const originalEnv = process.env.NODE_ENV;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalEnv;
  }
  vi.useRealTimers();
});

function cookiePair(response: Response): string {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

describe("router session helpers", () => {
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

  test.each([
    { hardened: false, nodeEnv: "development" },
    { hardened: false, nodeEnv: "test" },
    { hardened: true, nodeEnv: "production" },
    { hardened: true, nodeEnv: "staging" },
    { hardened: true, nodeEnv: undefined },
  ])(
    "uses fail-closed session cookie defaults when NODE_ENV is $nodeEnv",
    async ({ hardened, nodeEnv }) => {
      if (nodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = nodeEnv;
      }
      const store = createMemorySessionStore<{ userId: string }>();
      const createResponse = new Response(null);
      const session = await createSession(createResponse, store, { userId: "ada" });
      const createdCookie = createResponse.headers.get("set-cookie") ?? "";
      const expectedName = hardened ? "__Host-mreact.session" : "mreact.session";

      expect(createdCookie.startsWith(`${expectedName}=`)).toBe(true);
      expect(createdCookie.includes("; Secure")).toBe(hardened);

      const request = new Request("https://app.test/", {
        headers: { cookie: cookiePair(createResponse) },
      });
      await expect(getSession(request, store)).resolves.toMatchObject({ id: session.id });

      const destroyResponse = new Response(null);
      await destroySession(request, destroyResponse, store);
      const destroyedCookie = destroyResponse.headers.get("set-cookie") ?? "";
      expect(destroyedCookie.startsWith(`${expectedName}=; Max-Age=0`)).toBe(true);
      expect(destroyedCookie.includes("; Secure")).toBe(hardened);
    },
  );

  test("preserves explicit custom cookie options outside local environments", async () => {
    process.env.NODE_ENV = "staging";
    const store = createMemorySessionStore<{ userId: string }>();
    const options = {
      cookieName: "custom.session",
      path: "/app",
      sameSite: "Strict" as const,
      secure: false,
    };
    const response = new Response(null);

    await createSession(response, store, { userId: "ada" }, options);

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie.startsWith("custom.session=")).toBe(true);
    expect(cookie).toContain("Path=/app");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).not.toContain("Secure");

    const request = new Request("https://app.test/app", {
      headers: { cookie: cookiePair(response) },
    });
    const current = await getSession(request, store, options);
    expect(current?.data).toEqual({ userId: "ada" });

    const rotateResponse = new Response(null);
    const rotated = await rotateSession(request, rotateResponse, store, options);
    expect(rotated?.id).not.toBe(current?.id);
    expect(rotateResponse.headers.get("set-cookie")).toContain("custom.session=");

    const destroyResponse = new Response(null);
    await destroySession(
      new Request("https://app.test/app", {
        headers: { cookie: cookiePair(rotateResponse) },
      }),
      destroyResponse,
      store,
      options,
    );
    expect(destroyResponse.headers.get("set-cookie")).toContain("custom.session=; Max-Age=0");
  });

  test("uses an unprefixed implicit name when explicit options are incompatible with __Host-", async () => {
    process.env.NODE_ENV = "staging";
    const store = createMemorySessionStore<{ userId: string }>();
    const insecureResponse = new Response(null);
    const scopedResponse = new Response(null);

    await createSession(insecureResponse, store, { userId: "ada" }, { secure: false });
    await createSession(scopedResponse, store, { userId: "grace" }, { path: "/app" });

    expect(insecureResponse.headers.get("set-cookie")).toMatch(/^mreact\.session=/);
    expect(insecureResponse.headers.get("set-cookie")).not.toContain("Secure");
    expect(scopedResponse.headers.get("set-cookie")).toMatch(/^mreact\.session=/);
    expect(scopedResponse.headers.get("set-cookie")).toContain("Path=/app");
  });

  test("rejects invalid explicit __Host- options before mutating the store", async () => {
    process.env.NODE_ENV = "production";
    const set = vi.fn();
    const deleteRecord = vi.fn();
    const store = {
      delete: deleteRecord,
      get: vi.fn(),
      set,
    };

    await expect(
      createSession(
        new Response(null),
        store,
        { userId: "ada" },
        {
          cookieName: "__Host-custom.session",
          secure: false,
        },
      ),
    ).rejects.toThrow("__Host- cookies require Secure");
    expect(set).not.toHaveBeenCalled();

    await expect(
      destroySession(
        new Request("https://app.test/", {
          headers: { cookie: "__Host-custom.session=session-id" },
        }),
        new Response(null),
        store,
        { cookieName: "__Host-custom.session", path: "/app" },
      ),
    ).rejects.toThrow("__Host- cookies require Path=/");
    expect(deleteRecord).not.toHaveBeenCalled();

    await expect(
      rotateSession(
        new Request("https://app.test/", {
          headers: { cookie: "__Host-custom.session=session-id" },
        }),
        new Response(null),
        store,
        { cookieName: "__Host-custom.session", secure: false },
      ),
    ).rejects.toThrow("__Host- cookies require Secure");
    expect(store.get).not.toHaveBeenCalled();
    expect(deleteRecord).not.toHaveBeenCalled();
  });

  test("uses hardened defaults when the process global is unavailable", async () => {
    vi.stubGlobal("process", undefined);
    const store = createMemorySessionStore<{ userId: string }>();
    const response = new Response(null);
    const sessionPromise = createSession(response, store, { userId: "ada" });
    vi.unstubAllGlobals();

    await sessionPromise;

    expect(response.headers.get("set-cookie")).toMatch(/^__Host-mreact\.session=/);
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  test("uses hardened defaults when process.env is unavailable", async () => {
    vi.stubGlobal("process", {});
    const store = createMemorySessionStore<{ userId: string }>();
    const response = new Response(null);
    const sessionPromise = createSession(response, store, { userId: "ada" });
    vi.unstubAllGlobals();

    await sessionPromise;

    expect(response.headers.get("set-cookie")).toMatch(/^__Host-mreact\.session=/);
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  test("rejects immutable response headers before mutating session records", async () => {
    const set = vi.fn();
    const deleteRecord = vi.fn();
    const get = vi.fn().mockResolvedValue({
      createdAt: 1,
      data: { userId: "ada" },
      expiresAt: Date.now() + 60_000,
      id: "session-id",
    });
    const store = { delete: deleteRecord, get, set };

    await expect(
      createSession(Response.redirect("https://app.test/"), store, { userId: "ada" }),
    ).rejects.toThrow("mutable headers");
    expect(set).not.toHaveBeenCalled();

    const request = new Request("https://app.test/", {
      headers: { cookie: "__Host-mreact.session=session-id" },
    });
    await expect(
      destroySession(request, Response.redirect("https://app.test/"), store),
    ).rejects.toThrow("mutable headers");
    await expect(
      rotateSession(request, Response.redirect("https://app.test/"), store),
    ).rejects.toThrow("mutable headers");
    expect(get).not.toHaveBeenCalled();
    expect(deleteRecord).not.toHaveBeenCalled();
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

  test("memory session store sweeps expired entries during read-heavy access", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const store = createMemorySessionStore<{ userId: string }>({ maxEntries: 2 });
    await store.set({ createdAt: 1_000, data: { userId: "a" }, expiresAt: 2_000, id: "a" });
    await store.set({ createdAt: 1_000, data: { userId: "b" }, expiresAt: 2_000, id: "b" });
    vi.setSystemTime(3_000);

    expect(await store.get("missing")).toBeUndefined();

    await store.set({ createdAt: 3_000, data: { userId: "c" }, expiresAt: 4_000, id: "c" });
    await store.set({ createdAt: 3_000, data: { userId: "d" }, expiresAt: 4_000, id: "d" });
    expect(await store.get("c")).toBeDefined();
    expect(await store.get("d")).toBeDefined();
  });

  test("memory session store evicts least recently used entries over the configured size cap", async () => {
    const store = createMemorySessionStore<{ userId: string }>({ maxEntries: 2 });
    const expiresAt = Date.now() + 60_000;
    await store.set({ createdAt: 1, data: { userId: "a" }, expiresAt, id: "a" });
    await store.set({ createdAt: 1, data: { userId: "b" }, expiresAt, id: "b" });
    expect(await store.get("a")).toBeDefined();
    await store.set({ createdAt: 1, data: { userId: "c" }, expiresAt, id: "c" });

    expect(await store.get("a")).toBeDefined();
    expect(await store.get("b")).toBeUndefined();
    expect(await store.get("c")).toBeDefined();
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
