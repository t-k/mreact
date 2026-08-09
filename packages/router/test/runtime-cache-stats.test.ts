import { describe, expect, test } from "vitest";
import { getRouterRuntimeCacheStats } from "../src/runtime-cache.js";

describe("router runtime cache stats", () => {
  test("reports configured cache sizes without exposing cache keys", () => {
    const stats = getRouterRuntimeCacheStats();

    expect(stats.length).toBeGreaterThan(0);
    expect(stats).toContainEqual(
      expect.objectContaining({
        maxEntries: expect.any(Number),
        name: "server-transform",
        size: expect.any(Number),
      }),
    );
    expect(stats).toContainEqual(
      expect.objectContaining({
        maxEntries: expect.any(Number),
        name: "source-module",
        size: expect.any(Number),
      }),
    );
    expect(stats).toContainEqual({
      evictions: 0,
      hits: 0,
      maxEntries: 0,
      misses: 0,
      name: "rendered-shell",
      size: 0,
    });
    expect(JSON.stringify(stats)).not.toContain("\u0000");
  });
});
