import { describe, expect, test } from "vitest";
import { createVariantFixtureCache } from "./variant-fixture-cache.js";

describe("variant fixture cache", () => {
  test("keeps independent fixtures alive per variant key", async () => {
    const events: string[] = [];
    const cache = createVariantFixtureCache<string, { id: string; close(): Promise<void> }>();

    const first = await cache.getOrCreate("native", async () => ({
      id: "native-1",
      close: async () => {
        events.push("close:native-1");
      },
    }));
    const compat = await cache.getOrCreate("compat", async () => ({
      id: "compat-1",
      close: async () => {
        events.push("close:compat-1");
      },
    }));
    const firstAgain = await cache.getOrCreate("native", async () => ({
      id: "native-2",
      close: async () => {
        events.push("close:native-2");
      },
    }));

    expect(firstAgain).toBe(first);
    expect(compat.id).toBe("compat-1");
    expect(events).toEqual([]);

    await cache.closeAll();

    expect(events).toEqual(["close:native-1", "close:compat-1"]);
  });
});
