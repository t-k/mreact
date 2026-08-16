import { afterEach, describe, expect, test, vi } from "vitest";
import {
  cacheRouteResponse,
  cacheControl,
  cachedRouteResponse,
  consumeInvalidations,
  createMemoryRouteCache,
  revalidatePath,
  routeCacheKey,
  routeCachePolicyFromSource,
  stripRevalidateExport,
  withRouteCacheContext,
} from "../src/cache.js";
import type { AppRouterCacheEntry } from "../src/cache.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("router cache helpers", () => {
  test("cacheControl records Qwik-style directives in the active route cache context", async () => {
    const { cachePolicy } = await withRouteCacheContext(undefined, () => {
      cacheControl({
        maxAge: 5,
        sMaxAge: 60,
        staleWhileRevalidate: 300,
      });
    });

    expect(cachePolicy).toEqual({
      cacheControl: "max-age=5, s-maxage=60, stale-while-revalidate=300",
      revalidateSeconds: 60,
    });
  });

  test("cacheControl with maxAge only sets headers without enabling shared route caching", async () => {
    const { cachePolicy } = await withRouteCacheContext(undefined, () => {
      cacheControl({ maxAge: 30 });
    });

    expect(cachePolicy).toEqual({
      cacheControl: "max-age=30",
      revalidateSeconds: 0,
    });
  });

  test("routeCachePolicyFromSource parses `export const revalidate = N`", () => {
    expect(routeCachePolicyFromSource("export const revalidate = 60;")).toEqual({
      cacheControl: "s-maxage=60, stale-while-revalidate",
      revalidateSeconds: 60,
    });
    expect(routeCachePolicyFromSource("export const revalidate = 0")).toEqual({
      cacheControl: "no-store",
      revalidateSeconds: 0,
    });
    expect(routeCachePolicyFromSource("no revalidate here")).toBeUndefined();
  });

  test("routeCachePolicyFromSource warns when revalidate is present but not a bare integer", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(routeCachePolicyFromSource("export const revalidate = 60 * 60;")).toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("revalidate must be a plain integer literal"),
    );
  });

  test("stripRevalidateExport removes the export and leaves the rest intact", () => {
    const stripped = stripRevalidateExport(
      "export const revalidate = 30;\nexport default function Page() {}",
    );
    expect(stripped).not.toMatch(/revalidate\s*=/);
    expect(stripped).toContain("export default function Page");
  });

  test("routeCacheKey is path+query keyed and ignores Host", () => {
    const url1 = new URL("https://a.test/items?id=1");
    const url2 = new URL("https://b.test/items?id=1");
    expect(routeCacheKey("/app", "/items", url1)).toBe(routeCacheKey("/app", "/items", url2));
  });

  test("routeCacheKey separates document and navigation response variants", () => {
    const url = new URL("https://a.test/items?id=1");

    expect(routeCacheKey("/app", "/items", url, "document")).not.toBe(
      routeCacheKey("/app", "/items", url, "navigation"),
    );
  });

  test("cachedRouteResponse returns undefined when the cache is empty", async () => {
    const cache = createMemoryRouteCache();
    await expect(cachedRouteResponse({ cache, key: "missing" })).resolves.toBeUndefined();
  });

  test("cachedRouteResponse rejects legacy persistent entries without a schema marker", async () => {
    const cache = createMemoryRouteCache();
    await cache.set("legacy", {
      body: "<main>visitor A</main>",
      cacheControl: "s-maxage=60",
      expiresAt: Date.now() + 60_000,
      path: "/",
      status: 200,
    });

    await expect(cachedRouteResponse({ cache, key: "legacy" })).resolves.toBeUndefined();
  });

  test("cachedRouteResponse rejects complete schema-1 persistent entries", async () => {
    const cache = createMemoryRouteCache();
    await cache.set("schema-1", {
      body: "<main>visitor A</main>",
      cacheControl: "s-maxage=60",
      expiresAt: Date.now() + 60_000,
      headers: { "content-type": "text/html; charset=utf-8" },
      path: "/",
      schemaVersion: 1,
      status: 200,
    } as unknown as AppRouterCacheEntry);

    await expect(cachedRouteResponse({ cache, key: "schema-1" })).resolves.toBeUndefined();
  });

  test("cachedRouteResponse rejects current entries that dropped persisted headers", async () => {
    const cache = createMemoryRouteCache();
    await cache.set("incomplete", {
      body: "<main>missing CSP</main>",
      cacheControl: "s-maxage=60",
      expiresAt: Date.now() + 60_000,
      path: "/",
      schemaVersion: 2,
      status: 200,
    });

    await expect(cachedRouteResponse({ cache, key: "incomplete" })).resolves.toBeUndefined();
  });

  test("cacheRouteResponse marks newly stored entries with the current schema", async () => {
    const cache = createMemoryRouteCache();
    await cacheRouteResponse({
      cache,
      key: "current",
      path: "/",
      policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
      response: new Response("<main>safe</main>"),
    });

    expect(cache.get("current")).toMatchObject({ schemaVersion: 2 });
  });

  test("cacheRouteResponse without a policy passes the response through unchanged", async () => {
    const original = new Response("body");
    const result = await cacheRouteResponse({
      key: "k",
      path: "/p",
      policy: undefined,
      response: original,
    });
    expect(result).toBe(original);
  });

  test("cacheRouteResponse with revalidateSeconds=0 sets cache-control on the response without storing it", async () => {
    const cache = createMemoryRouteCache();
    const result = await cacheRouteResponse({
      cache,
      key: "k0",
      path: "/p",
      policy: { cacheControl: "no-store", revalidateSeconds: 0 },
      response: new Response("body"),
    });
    expect(result.headers.get("cache-control")).toBe("no-store");
  });

  test("cacheRouteResponse stores under the key and cachedRouteResponse retrieves a HIT response", async () => {
    const cache = createMemoryRouteCache();
    await cacheRouteResponse({
      cache,
      key: "k1",
      path: "/p",
      policy: { cacheControl: "s-maxage=10", revalidateSeconds: 10 },
      response: new Response("<p>hi</p>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    });

    const stored = await cachedRouteResponse({ cache, key: "k1" });
    expect(stored).toBeInstanceOf(Response);
    expect(stored!.headers.get("x-mreact-cache")).toBe("HIT");
    await expect(stored!.text()).resolves.toBe("<p>hi</p>");
  });

  test("cacheRouteResponse skips shared storage for credentialed requests", async () => {
    const cache = createMemoryRouteCache();
    const result = await cacheRouteResponse({
      cache,
      key: "credentialed",
      path: "/profile",
      policy: { cacheControl: "s-maxage=10", revalidateSeconds: 10 },
      request: new Request("https://app.test/profile", {
        headers: { cookie: "session=abc" },
      }),
      response: new Response("<p>Ada</p>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    });

    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(await cachedRouteResponse({ cache, key: "credentialed" })).toBeUndefined();
  });

  test("cacheRouteResponse skips shared storage for common custom auth headers", async () => {
    const cache = createMemoryRouteCache();
    for (const [key, headers] of [
      ["api-key", { "x-api-key": "secret" }],
      ["cloudflare-access", { "cf-access-jwt-assertion": "jwt" }],
      ["access-token", { "x-access-token": "token" }],
      ["id-token", { "x-id-token": "token" }],
    ] as const) {
      const result = await cacheRouteResponse({
        cache,
        key,
        path: "/profile",
        policy: { cacheControl: "s-maxage=10", revalidateSeconds: 10 },
        request: new Request("https://app.test/profile", { headers }),
        response: new Response("<p>Ada</p>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      });

      expect(result.headers.get("cache-control")).toBe("private, no-store");
      expect(await cachedRouteResponse({ cache, key })).toBeUndefined();
    }
  });

  test("cacheRouteResponse treats CDN and proxy infrastructure headers as public", async () => {
    const cache = createMemoryRouteCache();
    const request = new Request("https://app.test/blog", {
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        "cf-ray": "abc123",
        "x-forwarded-for": "203.0.113.10",
        "x-forwarded-proto": "https",
      },
    });
    const result = await cacheRouteResponse({
      cache,
      key: "cdn-public",
      path: "/blog",
      policy: { cacheControl: "s-maxage=10", revalidateSeconds: 10 },
      request,
      response: new Response("<p>public</p>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    });

    expect(result.headers.get("cache-control")).toBe("s-maxage=10");
    expect(result.headers.get("x-mreact-cache")).toBe("MISS");
    await expect(cachedRouteResponse({ cache, key: "cdn-public", request })).resolves.toBeInstanceOf(
      Response,
    );
  });

  test("cacheRouteResponse preserves Set-Cookie when skipping shared storage", async () => {
    const cache = createMemoryRouteCache();
    const result = await cacheRouteResponse({
      cache,
      key: "set-cookie",
      path: "/profile",
      policy: { cacheControl: "s-maxage=10", revalidateSeconds: 10 },
      response: new Response("<p>Ada</p>", {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "set-cookie": "session=next; Path=/",
        },
      }),
    });

    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(result.headers.get("set-cookie")).toBe("session=next; Path=/");
    expect(await cachedRouteResponse({ cache, key: "set-cookie" })).toBeUndefined();
  });

  test("cachedRouteResponse skips HITs for credentialed requests", async () => {
    const cache = createMemoryRouteCache();
    await cacheRouteResponse({
      cache,
      key: "public",
      path: "/profile",
      policy: { cacheControl: "s-maxage=10", revalidateSeconds: 10 },
      response: new Response("<p>public</p>", { status: 200 }),
    });

    expect(await cachedRouteResponse({
      cache,
      key: "public",
      request: new Request("https://app.test/profile", {
        headers: { authorization: "Bearer token" },
      }),
    })).toBeUndefined();
  });

  test("cachedRouteResponse skips HITs when common custom auth headers are present", async () => {
    const cache = createMemoryRouteCache();
    await cacheRouteResponse({
      cache,
      key: "public",
      path: "/profile",
      policy: { cacheControl: "s-maxage=10", revalidateSeconds: 10 },
      response: new Response("<p>public</p>", { status: 200 }),
    });

    for (const headers of [
      { "x-api-key": "secret" },
      { "cf-access-jwt-assertion": "jwt" },
      { "x-access-token": "token" },
      { "x-id-token": "token" },
    ]) {
      expect(await cachedRouteResponse({
        cache,
        key: "public",
        request: new Request("https://app.test/profile", { headers }),
      })).toBeUndefined();
    }
  });

  test("cachedRouteResponse returns undefined for an expired entry", async () => {
    const cache = createMemoryRouteCache();
    await cacheRouteResponse({
      cache,
      key: "expired",
      path: "/p",
      policy: { cacheControl: "s-maxage=1", revalidateSeconds: 1 },
      now: 0,
      response: new Response("hi", { status: 200 }),
    });
    expect(await cachedRouteResponse({ cache, key: "expired", now: 10_000 })).toBeUndefined();
  });

  test("memory route cache removes expired entries on direct reads", () => {
    const cache = createMemoryRouteCache();
    cache.set("expired", {
      body: "stale",
      cacheControl: "s-maxage=1",
      expiresAt: 1,
      path: "/p",
      status: 200,
    });

    expect(cache.get("expired")).toBeUndefined();
  });

  test("memory route cache evicts oldest entries over the configured size cap", () => {
    const cache = createMemoryRouteCache({ maxEntries: 2 });
    const entry = (path: string) => ({
      body: path,
      cacheControl: "s-maxage=60",
      expiresAt: Date.now() + 60_000,
      path,
      status: 200,
    });

    cache.set("k1", entry("/one"));
    cache.set("k2", entry("/two"));
    cache.set("k3", entry("/three"));

    expect(cache.get("k1")).toBeUndefined();
    expect(cache.get("k2")).toBeDefined();
    expect(cache.get("k3")).toBeDefined();
  });

  test("revalidatePath drops entries whose path matches across cache keys", async () => {
    const cache = createMemoryRouteCache();
    await cacheRouteResponse({
      cache,
      key: "k-a",
      path: "/page/",
      policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
      response: new Response("a"),
    });
    revalidatePath("/page");
    await consumeInvalidations(cache);
    expect(await cachedRouteResponse({ cache, key: "k-a" })).toBeUndefined();
  });

  test("revalidatePath outside a request invalidates every live route cache", async () => {
    const firstCache = createMemoryRouteCache();
    const secondCache = createMemoryRouteCache();
    const policy = { cacheControl: "s-maxage=60", revalidateSeconds: 60 };
    await Promise.all([
      cacheRouteResponse({
        cache: firstCache,
        key: "broadcast-first",
        path: "/broadcast",
        policy,
        response: new Response("first"),
      }),
      cacheRouteResponse({
        cache: secondCache,
        key: "broadcast-second",
        path: "/broadcast",
        policy,
        response: new Response("second"),
      }),
      cacheRouteResponse({
        key: "broadcast-default",
        path: "/broadcast",
        policy,
        response: new Response("default"),
      }),
    ]);

    revalidatePath("/broadcast");

    const first = await cachedRouteResponse({ cache: firstCache, key: "broadcast-first" });
    const second = await cachedRouteResponse({ cache: secondCache, key: "broadcast-second" });
    const defaultEntry = await cachedRouteResponse({ key: "broadcast-default" });
    expect([first, second, defaultEntry]).toEqual([undefined, undefined, undefined]);
  });

  test("revalidatePath prevents a blocked older cache write from restoring stale HTML", async () => {
    const memoryCache = createMemoryRouteCache();
    let releaseSet: (() => void) | undefined;
    let reportSetStarted: (() => void) | undefined;
    const setReleased = new Promise<void>((resolve) => {
      releaseSet = resolve;
    });
    const setStarted = new Promise<void>((resolve) => {
      reportSetStarted = resolve;
    });
    const cache = {
      deleteByPath: memoryCache.deleteByPath.bind(memoryCache),
      get: memoryCache.get.bind(memoryCache),
      async set(key: string, entry: AppRouterCacheEntry) {
        reportSetStarted?.();
        await setReleased;
        memoryCache.set(key, entry);
      },
    };
    const rendering = withRouteCacheContext(cache, async () =>
      await cacheRouteResponse({
        cache,
        key: "blocked-stale-write",
        path: "/blocked-stale-write",
        policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
        response: new Response("old render"),
      }),
    );

    await setStarted;
    revalidatePath("/blocked-stale-write");
    await consumeInvalidations(cache);
    releaseSet?.();
    const { value } = await rendering;

    expect(value.headers.get("cache-control")).toBe("private, no-store");
    expect(value.headers.get("x-mreact-cache")).toBe("DYNAMIC");
    expect(await cachedRouteResponse({ cache, key: "blocked-stale-write" })).toBeUndefined();
  });

  test("writes an expired tombstone when deleting a late stale write fails", async () => {
    const persistentBackend = createMemoryRouteCache();
    let deleteCalls = 0;
    let releaseSet: (() => void) | undefined;
    let reportSetStarted: (() => void) | undefined;
    const setReleased = new Promise<void>((resolve) => {
      releaseSet = resolve;
    });
    const setStarted = new Promise<void>((resolve) => {
      reportSetStarted = resolve;
    });
    let setCalls = 0;
    const cache = {
      deleteByPath(path: string) {
        deleteCalls += 1;
        if (deleteCalls === 2) {
          throw new Error("persistent delete failed");
        }
        return persistentBackend.deleteByPath(path);
      },
      get: persistentBackend.get.bind(persistentBackend),
      async set(key: string, entry: AppRouterCacheEntry) {
        setCalls += 1;
        if (setCalls === 1) {
          reportSetStarted?.();
          await setReleased;
        }
        persistentBackend.set(key, entry);
      },
    };
    const rendering = withRouteCacheContext(cache, async () =>
      await cacheRouteResponse({
        cache,
        key: "failed-late-delete",
        path: "/failed-late-delete",
        policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
        response: new Response("stale"),
      }),
    );

    await setStarted;
    revalidatePath("/failed-late-delete");
    await consumeInvalidations(cache);
    releaseSet?.();
    await expect(rendering).rejects.toThrow("persistent delete failed");

    const secondAdapterObject = {
      deleteByPath: persistentBackend.deleteByPath.bind(persistentBackend),
      get: persistentBackend.get.bind(persistentBackend),
      set: persistentBackend.set.bind(persistentBackend),
    };
    expect(
      await cachedRouteResponse({ cache: secondAdapterObject, key: "failed-late-delete" }),
    ).toBeUndefined();
  });

  test("revalidatePath prevents an older in-flight render from repopulating stale HTML", async () => {
    const cache = createMemoryRouteCache();
    let releaseRender: (() => void) | undefined;
    let reportMiss: (() => void) | undefined;
    const renderReleased = new Promise<void>((resolve) => {
      releaseRender = resolve;
    });
    const missReported = new Promise<void>((resolve) => {
      reportMiss = resolve;
    });
    const rendering = withRouteCacheContext(cache, async () => {
      expect(await cachedRouteResponse({ cache, key: "stale-write" })).toBeUndefined();
      reportMiss?.();
      await renderReleased;
      return await cacheRouteResponse({
        cache,
        key: "stale-write",
        path: "/stale-write",
        policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
        response: new Response("old render"),
      });
    });

    await missReported;
    revalidatePath("/stale-write");
    await consumeInvalidations(cache);
    releaseRender?.();
    const { value } = await rendering;

    expect(value.headers.get("cache-control")).toBe("private, no-store");
    expect(value.headers.get("x-mreact-cache")).toBe("DYNAMIC");
    expect(await cachedRouteResponse({ cache, key: "stale-write" })).toBeUndefined();
  });

  test("revalidatePath does not suppress an unrelated in-flight cache write", async () => {
    const cache = createMemoryRouteCache();
    let releaseRender: (() => void) | undefined;
    let reportStarted: (() => void) | undefined;
    const renderReleased = new Promise<void>((resolve) => {
      releaseRender = resolve;
    });
    const renderStarted = new Promise<void>((resolve) => {
      reportStarted = resolve;
    });
    const rendering = withRouteCacheContext(cache, async () => {
      reportStarted?.();
      await renderReleased;
      return await cacheRouteResponse({
        cache,
        key: "unrelated-write",
        path: "/unrelated",
        policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
        response: new Response("fresh unrelated render"),
      });
    });

    await renderStarted;
    revalidatePath("/target");
    await consumeInvalidations(cache);
    releaseRender?.();
    const { value } = await rendering;

    expect(value.headers.get("x-mreact-cache")).toBe("MISS");
    expect(await cachedRouteResponse({ cache, key: "unrelated-write" })).toBeDefined();
  });

  test("retries a failed external invalidation before serving from that cache", async () => {
    const memoryCache = createMemoryRouteCache();
    let attempts = 0;
    let rejectFirstAttempt: ((reason: Error) => void) | undefined;
    let reportFirstAttempt: (() => void) | undefined;
    const firstAttemptStarted = new Promise<void>((resolve) => {
      reportFirstAttempt = resolve;
    });
    const cache = {
      deleteByPath(path: string) {
        attempts += 1;
        if (attempts === 1) {
          reportFirstAttempt?.();
          return new Promise<void>((_resolve, reject) => {
            rejectFirstAttempt = reject;
          });
        }
        return memoryCache.deleteByPath(path);
      },
      get: memoryCache.get.bind(memoryCache),
      set: memoryCache.set.bind(memoryCache),
    };
    await cacheRouteResponse({
      cache,
      key: "retry-invalidation",
      path: "/retry-invalidation",
      policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
      response: new Response("stale"),
    });

    revalidatePath("/retry-invalidation");
    await firstAttemptStarted;
    const failedConsumption = consumeInvalidations(cache);
    rejectFirstAttempt?.(new Error("temporary cache failure"));
    await expect(failedConsumption).rejects.toThrow("temporary cache failure");

    await consumeInvalidations(cache);
    expect(attempts).toBe(2);
    expect(await cachedRouteResponse({ cache, key: "retry-invalidation" })).toBeUndefined();
  });

  test("bounds invalidations and fails a cache closed when its deletion hangs", async () => {
    const memoryCache = createMemoryRouteCache();
    let releaseDeletion: (() => void) | undefined;
    let reportDeletionStarted: (() => void) | undefined;
    const deletionReleased = new Promise<void>((resolve) => {
      releaseDeletion = resolve;
    });
    const deletionStarted = new Promise<void>((resolve) => {
      reportDeletionStarted = resolve;
    });
    const cache = {
      async deleteByPath(path: string) {
        reportDeletionStarted?.();
        await deletionReleased;
        memoryCache.deleteByPath(path);
      },
      get: memoryCache.get.bind(memoryCache),
      set: memoryCache.set.bind(memoryCache),
    };
    await cacheRouteResponse({
      cache,
      key: "stuck-cache",
      path: "/stuck-cache",
      policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
      response: new Response("stale"),
    });

    revalidatePath("/stuck-0");
    await deletionStarted;
    for (let index = 1; index <= 1_100; index += 1) {
      revalidatePath(`/stuck-${index}`);
    }

    expect(await cachedRouteResponse({ cache, key: "stuck-cache" })).toBeUndefined();
    const disabledResponse = await cacheRouteResponse({
      cache,
      key: "disabled-cache-write",
      path: "/disabled-cache-write",
      policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
      response: new Response("fresh"),
    });
    expect(disabledResponse.headers.get("cache-control")).toBe("private, no-store");
    expect(disabledResponse.headers.get("x-mreact-cache")).toBe("DYNAMIC");
    expect(memoryCache.get("disabled-cache-write")).toBeUndefined();

    releaseDeletion?.();
    await consumeInvalidations(cache);
  });

  test("limits active-context overflow to that request when cache deletion stays healthy", async () => {
    const cache = createMemoryRouteCache();
    let beginExternalInvalidations: (() => void) | undefined;
    const externalInvalidationsStarted = new Promise<void>((resolve) => {
      beginExternalInvalidations = resolve;
    });
    const externalInvalidations = externalInvalidationsStarted.then(async () => {
      for (let index = 0; index <= 1_024; index += 1) {
        revalidatePath(`/healthy-${index}`);
        await consumeInvalidations(cache);
      }
    });
    const { value } = await withRouteCacheContext(cache, async () => {
      beginExternalInvalidations?.();
      await externalInvalidations;

      return await cacheRouteResponse({
        cache,
        key: "overflowed-request",
        path: "/overflowed-request",
        policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
        response: new Response("request-local"),
      });
    });
    expect(value.headers.get("cache-control")).toBe("private, no-store");
    expect(value.headers.get("x-mreact-cache")).toBe("DYNAMIC");

    const healthyResponse = await withRouteCacheContext(cache, async () =>
      await cacheRouteResponse({
        cache,
        key: "healthy-after-context",
        path: "/healthy-after-context",
        policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
        response: new Response("shared"),
      }),
    );
    expect(healthyResponse.value.headers.get("x-mreact-cache")).toBe("MISS");
    expect(await cachedRouteResponse({ cache, key: "healthy-after-context" })).toBeDefined();
  });

  test("revalidatePath leaves an unrelated cache entry intact when the path doesn't match", async () => {
    const cache = createMemoryRouteCache();
    await cacheRouteResponse({
      cache,
      key: "k-other",
      path: "/other",
      policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
      response: new Response("a"),
    });
    revalidatePath("/never-matches");
    await consumeInvalidations(cache);
    // Entry for /other is still present.
    expect(await cachedRouteResponse({ cache, key: "k-other" })).toBeDefined();
  });

  test("cacheRouteResponse falls back to the default content-type when the response has none", async () => {
    const cache = createMemoryRouteCache();
    const response = new Response("<p>x</p>");
    // The default Response constructor sets text/plain; remove it so the
    // cache helper hits the fallback branch.
    response.headers.delete("content-type");
    const result = await cacheRouteResponse({
      cache,
      key: "k-ct",
      path: "/p",
      policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
      response,
    });
    expect(result.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  test("does not store or replay nonce-bearing CSP responses", async () => {
    const cache = createMemoryRouteCache();
    const nonceHeader = "script-src 'self' 'nonce-request123'";
    const response = await cacheRouteResponse({
      cache,
      key: "nonce-new",
      path: "/nonce",
      policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
      response: new Response('<script nonce="request123">safe()</script>', {
        headers: { "content-security-policy": nonceHeader },
      }),
    });

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-mreact-cache")).toBe("DYNAMIC");
    expect(await cachedRouteResponse({ cache, key: "nonce-new" })).toBeUndefined();

    cache.set("nonce-persisted", {
      body: '<script nonce="persisted123">old()</script>',
      cacheControl: "s-maxage=60",
      expiresAt: Date.now() + 60_000,
      headers: { "content-security-policy": "script-src 'nonce-persisted123'" },
      path: "/nonce",
      schemaVersion: 2,
      status: 200,
    });
    expect(await cachedRouteResponse({ cache, key: "nonce-persisted" })).toBeUndefined();
  });

  test("continues to share CSP responses that use hashes instead of nonces", async () => {
    const cache = createMemoryRouteCache();
    await cacheRouteResponse({
      cache,
      key: "csp-hash",
      path: "/csp-hash",
      policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
      response: new Response("hashed script", {
        headers: { "content-security-policy": "script-src 'self' 'sha256-AbCdEf123='" },
      }),
    });

    const cached = await cachedRouteResponse({ cache, key: "csp-hash" });
    expect(cached?.headers.get("x-mreact-cache")).toBe("HIT");
    expect(await cached?.text()).toBe("hashed script");
  });

  test("revalidatePath normalizes a path without a leading slash and an all-slashes path", async () => {
    const cache = createMemoryRouteCache();
    await cacheRouteResponse({
      cache,
      key: "k-leading",
      // Stored with a trailing slash so the normalizer must rewrite it.
      path: "leading/no-slash",
      policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
      response: new Response("a"),
    });
    revalidatePath("leading/no-slash");
    await consumeInvalidations(cache);
    expect(await cachedRouteResponse({ cache, key: "k-leading" })).toBeUndefined();

    // Now exercise the "all-slashes collapses to /" branch.
    await cacheRouteResponse({
      cache,
      key: "k-root-slash",
      path: "//",
      policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
      response: new Response("a"),
    });
    revalidatePath("///");
    await consumeInvalidations(cache);
    expect(await cachedRouteResponse({ cache, key: "k-root-slash" })).toBeUndefined();
  });

  test("withRouteCacheContext records revalidatedPaths and applies them on exit", async () => {
    const cache = createMemoryRouteCache();
    await cacheRouteResponse({
      cache,
      key: "k-ctx",
      path: "/inner",
      policy: { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
      response: new Response("a"),
    });
    const { revalidatedPaths } = await withRouteCacheContext(cache, () => {
      revalidatePath("/inner");
      return 42;
    });
    expect(revalidatedPaths).toEqual(["/inner"]);
    expect(await cachedRouteResponse({ cache, key: "k-ctx" })).toBeUndefined();
  });

  test("withRouteCacheContext scopes revalidatePath to the current async request", async () => {
    const firstCache = createMemoryRouteCache();
    const secondCache = createMemoryRouteCache();
    let releaseSecondContext: (() => void) | undefined;
    let firstRevalidated: (() => void) | undefined;
    const secondContextStarted = new Promise<void>((resolve) => {
      releaseSecondContext = resolve;
    });
    const firstRevalidationDone = new Promise<void>((resolve) => {
      firstRevalidated = resolve;
    });

    const first = withRouteCacheContext(firstCache, async () => {
      await secondContextStarted;
      revalidatePath("/first");
      firstRevalidated?.();
      return "first";
    });
    const second = withRouteCacheContext(secondCache, async () => {
      releaseSecondContext?.();
      await firstRevalidationDone;
      revalidatePath("/second");
      return "second";
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.revalidatedPaths).toEqual(["/first"]);
    expect(secondResult.revalidatedPaths).toEqual(["/second"]);
  });
});
