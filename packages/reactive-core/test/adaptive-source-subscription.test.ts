import { describe, expect, test } from "vitest";
import { cell } from "../src/index.js";
import {
  notifySubscribers,
  subscribeAdaptiveSource,
  subscribeRefreshable,
  subscribeRefreshableIfTracked,
  subscribeRefreshableIfTrackedLazy,
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

  test("does not create a lazy refresh listener when no source is read", () => {
    const values: string[] = [];
    let factories = 0;
    const subscription = subscribeRefreshableIfTrackedLazy(
      () => {
        values.push("static");
      },
      () => {
        factories += 1;
        return () => {
          values.push("refresh");
        };
      },
    );

    expect(values).toEqual(["static"]);
    expect(factories).toBe(0);
    expect(subscription).toBeUndefined();
  });

  test("creates a lazy refresh listener only after a source is read", async () => {
    const external = cell("A");
    const values: string[] = [];
    let factories = 0;
    const subscription = subscribeRefreshableIfTrackedLazy(
      () => {
        values.push(`probe:${external.get()}`);
      },
      () => {
        factories += 1;
        return () => {
          values.push(`refresh:${external.get()}`);
        };
      },
    );

    expect(factories).toBe(1);
    expect(values).toEqual(["probe:A"]);
    external.set("B");
    await flushEffects();
    expect(values).toEqual(["probe:A", "refresh:B"]);

    subscription?.dispose();
  });

  test("keeps nested lazy refresh factories isolated", async () => {
    const outerSource = cell("outer-a");
    const innerSource = cell("inner-a");
    const values: string[] = [];
    let innerSubscription: ReturnType<typeof subscribeRefreshableIfTrackedLazy>;
    let createdInner = false;
    const outerSubscription = subscribeRefreshableIfTrackedLazy(
      () => {
        if (!createdInner) {
          createdInner = true;
          innerSubscription = subscribeRefreshableIfTrackedLazy(
            () => {
              innerSource.get();
            },
            () => () => {
              values.push(`inner:${innerSource.get()}`);
            },
          );
        }
        outerSource.get();
      },
      () => () => {
        values.push(`outer:${outerSource.get()}`);
      },
    );

    outerSource.set("outer-b");
    innerSource.set("inner-b");
    await flushEffects();
    expect(values).toEqual(["outer:outer-b", "inner:inner-b"]);

    outerSubscription?.dispose();
    innerSubscription?.dispose();
  });

  test("cleans a promoted lazy refresh listener when the probe throws", async () => {
    const external = cell("A");
    let refreshes = 0;

    expect(() =>
      subscribeRefreshableIfTrackedLazy(
        () => {
          external.get();
          throw new Error("probe failed");
        },
        () => () => {
          refreshes += 1;
          external.get();
        },
      ),
    ).toThrow("probe failed");

    external.set("B");
    await flushEffects();
    expect(refreshes).toBe(0);
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

  test("promotes beside an existing subscriber without disturbing it", async () => {
    const external = cell("A");
    const existingValues: string[] = [];
    const deferredValues: string[] = [];
    const existing = subscribeRefreshable(() => {
      existingValues.push(external.get());
    });
    const deferred = subscribeRefreshableIfTracked(() => {
      deferredValues.push(external.get());
    });

    external.set("B");
    await flushEffects();
    expect(existingValues).toEqual(["A", "B"]);
    expect(deferredValues).toEqual(["A", "B"]);

    deferred?.dispose();
    external.set("C");
    await flushEffects();
    expect(existingValues).toEqual(["A", "B", "C"]);
    expect(deferredValues).toEqual(["A", "B"]);
    existing.dispose();
  });

  test("does not report a temporary no-subscriber transition while promoting", () => {
    let noSubscribers = 0;
    const source: Source = {
      onNoSubscribers: () => {
        noSubscribers += 1;
      },
      subscribers: null,
    };
    const subscription = subscribeRefreshableIfTracked(() => {
      trackSource(source);
    });

    expect(noSubscribers).toBe(0);
    subscription?.dispose();
    expect(noSubscribers).toBe(1);
    expect(source.subscribers).toBeNull();
  });

  test("keeps nested deferred tracking isolated", async () => {
    const outerSource = cell("outer-a");
    const innerSource = cell("inner-a");
    const outerValues: string[] = [];
    const innerValues: string[] = [];
    let innerSubscription: ReturnType<typeof subscribeRefreshableIfTracked>;
    let nestedCreated = false;
    const outerSubscription = subscribeRefreshableIfTracked(() => {
      if (!nestedCreated) {
        nestedCreated = true;
        innerSubscription = subscribeRefreshableIfTracked(() => {
          innerValues.push(innerSource.get());
        });
      }
      outerValues.push(outerSource.get());
    });

    outerSource.set("outer-b");
    innerSource.set("inner-b");
    await flushEffects();
    expect(outerValues).toEqual(["outer-a", "outer-b"]);
    expect(innerValues).toEqual(["inner-a", "inner-b"]);

    outerSubscription?.dispose();
    innerSubscription?.dispose();
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

  test("cleans every promoted dependency when its initial listener throws", () => {
    let firstNoSubscribers = 0;
    let secondNoSubscribers = 0;
    const first: Source = {
      onNoSubscribers: () => {
        firstNoSubscribers += 1;
      },
      subscribers: null,
    };
    const second: Source = {
      onNoSubscribers: () => {
        secondNoSubscribers += 1;
      },
      subscribers: null,
    };

    expect(() =>
      subscribeRefreshableIfTracked(() => {
        trackSource(first);
        trackSource(second);
        throw new Error("listener failed");
      }),
    ).toThrow("listener failed");

    expect(first.subscribers).toBeNull();
    expect(second.subscribers).toBeNull();
    expect(firstNoSubscribers).toBe(1);
    expect(secondNoSubscribers).toBe(1);
  });
});
