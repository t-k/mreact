import { describe, expect, test } from "vitest";
import { cell } from "../src/index.js";
import {
  notifySubscribers,
  subscribeAdaptiveSource,
  subscribeRefreshable,
  subscribeRefreshableIfTracked,
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

  test("does not allocate a refreshable subscription when no source is read", () => {
    const values: string[] = [];
    const subscription = subscribeRefreshableIfTracked(() => {
      values.push("static");
    });

    expect(values).toEqual(["static"]);
    expect(subscription).toBeUndefined();
  });

  test("promotes to a refreshable subscription on the first source read", async () => {
    const external = cell("A");
    const values: string[] = [];
    const subscription = subscribeRefreshableIfTracked(() => {
      values.push(external.get());
    });

    expect(subscription).toBeDefined();
    external.set("B");
    await flushEffects();
    expect(values).toEqual(["A", "B"]);

    subscription?.dispose();
    external.set("C");
    await flushEffects();
    expect(values).toEqual(["A", "B"]);
  });

  test("cleans a promoted subscription when its initial listener throws", async () => {
    const external = cell("A");
    let runs = 0;

    expect(() =>
      subscribeRefreshableIfTracked(() => {
        runs += 1;
        external.get();
        throw new Error("listener failed");
      }),
    ).toThrow("listener failed");

    external.set("B");
    await flushEffects();
    expect(runs).toBe(1);
  });
});
