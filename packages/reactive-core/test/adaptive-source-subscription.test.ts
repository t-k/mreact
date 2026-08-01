import { describe, expect, test } from "vitest";
import { cell } from "../src/index.js";
import {
  notifySubscribers,
  subscribeAdaptiveSource,
  subscribeRefreshable,
  trackSource,
  type Source,
} from "../src/internal.js";
import { flushEffects } from "../src/testing.js";

describe("subscribeAdaptiveSource", () => {
  test("tracks dependencies introduced by a later source value", async () => {
    const source: Source = { subscribers: null };
    const external = cell("A");
    const values: string[] = [];
    let readsExternal = false;

    const dispose = subscribeAdaptiveSource(source, () => {
      trackSource(source);
      values.push(readsExternal ? external.get() : "direct");
    });

    readsExternal = true;
    notifySubscribers(source);
    await flushEffects();
    external.set("B");
    await flushEffects();

    expect(values).toEqual(["direct", "A", "B"]);

    dispose();
    external.set("C");
    await flushEffects();
    expect(values).toEqual(["direct", "A", "B"]);
  });

  test("returns to a source-only subscription after an external dependency is removed", async () => {
    const source: Source = { subscribers: null };
    const external = cell("A");
    const values: string[] = [];
    let readsExternal = true;

    const dispose = subscribeAdaptiveSource(source, () => {
      trackSource(source);
      values.push(readsExternal ? external.get() : "direct");
    });

    readsExternal = false;
    notifySubscribers(source);
    await flushEffects();
    external.set("B");
    await flushEffects();

    expect(values).toEqual(["A", "direct"]);

    dispose();
  });

  test("does not run a queued listener after disposal", async () => {
    const source: Source = { subscribers: null };
    const values: string[] = [];
    const dispose = subscribeAdaptiveSource(source, () => {
      trackSource(source);
      values.push("run");
    });

    notifySubscribers(source);
    dispose();
    await flushEffects();

    expect(values).toEqual(["run"]);
  });
});

describe("subscribeRefreshable", () => {
  test("shares empty dependencies until the first reactive read", async () => {
    const external = cell("A");
    let readsExternal = false;
    const first = subscribeRefreshable(() => {
      if (readsExternal) {
        external.get();
      }
    });
    const second = subscribeRefreshable(() => {});
    const firstComputation = first as unknown as { deps: Set<Source> };
    const secondComputation = second as unknown as { deps: Set<Source> };

    expect(firstComputation.deps).toBe(secondComputation.deps);

    readsExternal = true;
    first.refresh();
    await flushEffects();
    expect(firstComputation.deps).not.toBe(secondComputation.deps);

    readsExternal = false;
    first.refresh();
    await flushEffects();
    expect(firstComputation.deps).toBe(secondComputation.deps);

    first.dispose();
    second.dispose();
  });

  test("retains a notification triggered synchronously after the first read", async () => {
    const external = cell("A");
    const values: string[] = [];
    const subscription = subscribeRefreshable(() => {
      const value = external.get();
      values.push(value);
      if (value === "A") {
        external.set("B");
      }
    });

    await flushEffects();

    expect(values).toEqual(["A", "B"]);
    subscription.dispose();
  });

  test("tracks external dependencies and supports explicit refreshes", async () => {
    const external = cell("A");
    const values: string[] = [];
    let prefix = "first";
    const subscription = subscribeRefreshable(() => {
      values.push(`${prefix}:${external.get()}`);
    });

    prefix = "manual";
    subscription.refresh();
    await flushEffects();
    external.set("B");
    await flushEffects();

    expect(values).toEqual(["first:A", "manual:A", "manual:B"]);

    subscription.dispose();
  });

  test("deduplicates an external notification and explicit refresh in the same batch", async () => {
    const external = cell("A");
    const values: string[] = [];
    const subscription = subscribeRefreshable(() => {
      values.push(external.get());
    });

    external.set("B");
    subscription.refresh();
    await flushEffects();

    expect(values).toEqual(["A", "B"]);
    subscription.dispose();
  });

  test("does not run a queued refresh after disposal", async () => {
    const values: string[] = [];
    const subscription = subscribeRefreshable(() => {
      values.push("run");
    });

    subscription.refresh();
    subscription.dispose();
    await flushEffects();

    expect(values).toEqual(["run"]);
  });
});
