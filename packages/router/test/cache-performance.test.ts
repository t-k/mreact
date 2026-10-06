import { afterEach, expect, test, vi } from "vitest";
import fc from "fast-check";
import { createMemoryRouteCache, type AppRouterCacheEntry } from "../src/cache.js";

afterEach(() => vi.restoreAllMocks());
function entry(path: string, expiresAt = 2000): AppRouterCacheEntry {
  return { body: path, cacheControl: "s-maxage=60", expiresAt, path, status: 200 };
}

test("full nonexpiring caches do not inspect every expiry on each insertion", () => {
  vi.spyOn(Date, "now").mockReturnValue(1000);
  const cache = createMemoryRouteCache({ maxEntries: 100 });
  let checks = 0;
  for (let i = 0; i < 100; i++) {
    cache.set(String(i), {
      ...entry(`/old/${i}`),
      get expiresAt() {
        checks++;
        return 2000;
      },
    });
  }
  checks = 0;
  for (let i = 0; i < 100; i++) cache.set(`new-${i}`, entry(`/new/${i}`));
  expect(checks).toBeLessThanOrEqual(100);
  expect(cache.get("new-99")).toBeDefined();
  expect(cache.get("0")).toBeUndefined();
});

test("capacity eviction follows insertion and update order without waiting for a periodic sweep", () => {
  vi.spyOn(Date, "now").mockReturnValue(1000);
  const cache = createMemoryRouteCache({ maxEntries: 2 });
  cache.set("first", entry("/first"));
  const expiredLater = entry("/later");
  cache.set("later", expiredLater);
  expiredLater.expiresAt = 999;
  cache.set("new", entry("/new"));
  expect(cache.get("first")).toBeUndefined();
  expect(cache.get("later")).toBeUndefined();
  expect(cache.get("new")).toBeDefined();
});

test("periodic sweeps reclaim expired entries before capacity eviction", () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  const cache = createMemoryRouteCache({ maxEntries: 2, sweepIntervalMs: 100 });
  cache.set("first", entry("/first", 3000));
  const expiring = entry("/later", 1100);
  cache.set("later", expiring);
  now.mockReturnValue(1100);
  cache.set("new", entry("/new", 3000));
  expect(cache.get("first")).toBeDefined();
  expect(cache.get("later")).toBeUndefined();
  expect(cache.get("new")).toBeDefined();
});

test("updates move to the newest position and remove their old path index", () => {
  vi.spyOn(Date, "now").mockReturnValue(1000);
  const cache = createMemoryRouteCache({ maxEntries: 2 });
  cache.set("first", entry("/old"));
  cache.set("second", entry("/second"));
  cache.get("first");
  cache.set("first", entry("/new"));
  cache.deleteByPath("/old");
  cache.set("third", entry("/third"));
  expect(cache.get("second")).toBeUndefined();
  expect(cache.get("first")).toBeDefined();
  cache.deleteByPath("new/");
  expect(cache.get("first")).toBeUndefined();
  expect(cache.get("third")).toBeDefined();
});

test("zero interval sweeps actual mutable expiries on every write", () => {
  vi.spyOn(Date, "now").mockReturnValue(1000);
  const cache = createMemoryRouteCache({ maxEntries: 2, sweepIntervalMs: 0 });
  const value = entry("/first");
  cache.set("first", value);
  value.expiresAt = 999;
  cache.set("second", entry("/second"));
  expect(cache.get("first")).toBeUndefined();
  expect(cache.get("second")).toBeDefined();
});

test.each(["get", "sweep"])("expiry getters may invalidate their entry during %s", (mode) => {
  vi.spyOn(Date, "now").mockReturnValue(1000);
  const cache = createMemoryRouteCache({ sweepIntervalMs: 0 });
  cache.set("self", {
    ...entry("/self"),
    get expiresAt() {
      cache.deleteByPath("/self");
      return 999;
    },
  });
  if (mode === "get") expect(cache.get("self")).toBeUndefined();
  else cache.set("next", entry("/next"));
  expect(cache.get("self")).toBeUndefined();
});

test("memory cache traces preserve expiration, capacity order, replacement and path invalidation", () => {
  let now = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          operation: fc.constantFrom("set", "get", "delete", "tick", "mutate-expiry"),
          key: fc.integer({ min: 0, max: 7 }),
          path: fc.integer({ min: 0, max: 3 }),
          ttl: fc.integer({ min: -2, max: 8 }),
        }),
        { minLength: 20, maxLength: 100 },
      ),
      (operations) => {
        now = 1000;
        const cache = createMemoryRouteCache({ maxEntries: 4, sweepIntervalMs: 5 });
        const expected = new Map<string, AppRouterCacheEntry>();
        const external = new Map<string, AppRouterCacheEntry>();
        let nextSweepAt = 0;
        for (const operation of operations) {
          const key = String(operation.key),
            path = `/path/${operation.path}`;
          if (operation.operation === "tick") now += 1;
          if (operation.operation === "set") {
            if (now >= nextSweepAt) {
              for (const [cachedKey, value] of expected)
                if (value.expiresAt <= now) expected.delete(cachedKey);
              nextSweepAt = now + 5;
            }
            const value = entry(path, now + operation.ttl);
            expected.delete(key);
            expected.set(key, value);
            external.set(key, value);
            cache.set(key, value);
            if (expected.size > 4) expected.delete(expected.keys().next().value!);
          }
          if (operation.operation === "mutate-expiry") {
            const value = external.get(key);
            if (value !== undefined) value.expiresAt = now + operation.ttl;
          }
          if (operation.operation === "delete") {
            cache.deleteByPath(path);
            for (const [cachedKey, value] of expected)
              if (value.path === path) expected.delete(cachedKey);
          }
          if (operation.operation === "get") {
            const value = expected.get(key);
            if (value !== undefined && value.expiresAt <= now) expected.delete(key);
            expect(cache.get(key)).toBe(expected.get(key));
          }
        }
        for (let key = 0; key < 8; key++) {
          const value = expected.get(String(key));
          expect(cache.get(String(key))).toBe(
            value !== undefined && value.expiresAt > now ? value : undefined,
          );
        }
      },
    ),
    { numRuns: 100, seed: 20261006 },
  );
});

test("expiry removal unindexes a reused key before its path changes", () => {
  vi.spyOn(Date, "now").mockReturnValue(1000);
  const cache = createMemoryRouteCache();
  cache.set("reused", entry("/old", 999));
  expect(cache.get("reused")).toBeUndefined();
  cache.set("reused", entry("/new"));
  cache.deleteByPath("/old");
  expect(cache.get("reused")).toBeDefined();
});

test("zero interval reclaims expiries even after the wall clock moves backwards", () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  const cache = createMemoryRouteCache({ maxEntries: 2, sweepIntervalMs: 0 });
  cache.set("oldest", entry("/oldest"));
  const expiring = entry("/expiring");
  cache.set("expiring", expiring);
  expiring.expiresAt = 998;
  now.mockReturnValue(999);
  cache.set("new", entry("/new"));
  expect(cache.get("oldest")).toBeDefined();
  expect(cache.get("expiring")).toBeUndefined();
  expect(cache.get("new")).toBeDefined();
});
