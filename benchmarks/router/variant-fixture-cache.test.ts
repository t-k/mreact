import { describe, expect, test } from "vitest";
import { createVariantFixtureCache } from "./variant-fixture-cache.js";

describe("variant fixture cache", () => {
  test("waits for remaining fixture closures when an earlier closure rejects", async () => {
    const cache = createVariantFixtureCache<string, { close(): Promise<void> }>();
    const release = Promise.withResolvers<void>();
    let closing = false;
    let closed = false;
    let settled = false;
    await cache.getOrCreate("broken", async () => ({
      close: async () => {
        throw new Error("broken fixture");
      },
    }));
    await cache.getOrCreate("slow", async () => ({
      close: async () => {
        closing = true;
        await release.promise;
        closed = true;
      },
    }));
    const result = cache.closeAll().catch((error: unknown) => {
      settled = true;
      return error;
    });
    try {
      await expect.poll(() => closing).toBe(true);
      expect(settled).toBe(false);
    } finally {
      release.resolve();
    }
    expect(await result).toBeInstanceOf(AggregateError);
    expect(closed).toBe(true);
  });

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

  test("coalesces concurrent first getOrCreate calls per key", async () => {
    const cache = createVariantFixtureCache<string, { id: string; close(): Promise<void> }>();
    let createCalls = 0;
    let releaseCreate: (() => void) | undefined;
    const release = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    const create = async () => {
      createCalls += 1;
      await release;
      return {
        id: "native-1",
        close: async () => {},
      };
    };

    const first = cache.getOrCreate("native", create);
    const second = cache.getOrCreate("native", create);

    await Promise.resolve();
    expect(createCalls).toBe(1);
    releaseCreate?.();

    const [firstFixture, secondFixture] = await Promise.all([first, second]);

    expect(firstFixture).toBe(secondFixture);
    expect(createCalls).toBe(1);
  });
});
