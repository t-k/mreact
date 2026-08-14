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
