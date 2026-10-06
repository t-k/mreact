import { afterEach, expect, test, vi } from "vitest";
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
    cache.set(String(i), { ...entry(`/old/${i}`), get expiresAt() { checks++; return 2000; } });
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
