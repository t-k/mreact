import { describe, expect, it } from "vitest";
import { effect } from "@reckona/mreact-reactive-core";
import { withCleanupScope } from "@reckona/mreact-reactive-core/internal";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { createStore, shallowEqual } from "../src/index.js";

describe("createStore", () => {
  it("returns the current state and shallow-merges set patches", () => {
    const store = createStore({ count: 0, name: "Ada" });

    store.set({ count: 1 });

    expect(store.get()).toEqual({ count: 1, name: "Ada" });
  });

  it("replaces the full state when replace is used", () => {
    const store = createStore<{ count: number; name?: string }>({
      count: 0,
      name: "Ada",
    });

    store.replace({ count: 2 });

    expect(store.get()).toEqual({ count: 2 });
  });

  it("updates from the previous state", () => {
    const store = createStore({ count: 0, name: "Ada" });

    store.update((previous) => ({ count: previous.count + 1 }));

    expect(store.get()).toEqual({ count: 1, name: "Ada" });
  });

  it("ignores prototype-pollution keys in set patches", () => {
    const store = createStore<Record<string, unknown>>({ safe: true });
    const patch = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"polluted":true},"prototype":{"polluted":true},"name":"Ada"}',
    ) as Record<string, unknown>;

    store.set(patch);

    expect(store.get()).toEqual({ safe: true, name: "Ada" });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("exposes selected slices as reactive cells", async () => {
    const store = createStore({ count: 0, name: "Ada" });
    const count = store.select((state) => state.count);
    const seen: number[] = [];

    effect(() => {
      seen.push(count.get());
    });
    store.set({ count: 1 });
    store.set({ name: "Grace" });
    await flushEffects();

    expect(seen).toEqual([0, 1]);
  });

  it("removes selected slice listeners when the current cleanup scope is disposed", () => {
    const store = createStore({ count: 0, name: "Ada" });
    let selectorCalls = 0;
    let disposeScope: (() => void) | undefined;

    const count = withCleanupScope(
      (dispose) => {
        disposeScope = dispose;
      },
      () =>
        store.select((state) => {
          selectorCalls += 1;
          return state.count;
        }),
    );

    expect(count.get()).toBe(0);
    expect(selectorCalls).toBe(1);
    expect(disposeScope).toBeDefined();

    disposeScope?.();
    store.set({ count: 1 });

    expect(selectorCalls).toBe(1);
  });

  it("lets selected cells created outside cleanup scopes dispose their listener", () => {
    const store = createStore({ count: 0, name: "Ada" });
    let selectorCalls = 0;
    const count = store.select((state) => {
      selectorCalls += 1;
      return state.count;
    });

    expect(count.get()).toBe(0);
    expect(selectorCalls).toBe(1);

    count.dispose();
    store.set({ count: 1 });

    expect(count.get()).toBe(0);
    expect(selectorCalls).toBe(1);
  });

  it("lets effects track direct store reads", async () => {
    const store = createStore({ count: 0 });
    const seen: number[] = [];

    effect(() => {
      seen.push(store.get().count);
    });
    store.set({ count: 1 });
    await flushEffects();

    expect(seen).toEqual([0, 1]);
  });

  it("notifies subscribers with next and previous state", () => {
    const store = createStore({ count: 0 });
    const calls: Array<[{ count: number }, { count: number }]> = [];

    const unsubscribe = store.subscribe((state, previous) => {
      calls.push([state, previous]);
    });
    store.set({ count: 1 });
    unsubscribe();
    store.set({ count: 2 });

    expect(calls).toEqual([[{ count: 1 }, { count: 0 }]]);
  });

  it("reports a single replace operation inside a transaction as a replace event", () => {
    const events: string[] = [];
    const store = createStore(
      { count: 0 },
      {
        instrument(event) {
          events.push(event.type);
        },
      },
    );

    store.transaction(() => {
      store.replace({ count: 1 });
    });

    expect(events).toEqual(["replace"]);
  });

  it("keeps multi-operation transactions grouped as transaction events", () => {
    const events: string[] = [];
    const store = createStore(
      { count: 0, name: "Ada" },
      {
        instrument(event) {
          events.push(event.type);
        },
      },
    );

    store.transaction(() => {
      store.set({ count: 1 });
      store.set({ name: "Grace" });
    });

    expect(events).toEqual(["transaction"]);
  });

  it("rolls back a throwing transaction without notifying partial state", () => {
    const store = createStore({ count: 0, name: "Ada" });
    const calls: Array<[{ count: number; name: string }, { count: number; name: string }]> = [];
    store.subscribe((state, previous) => {
      calls.push([state, previous]);
    });

    expect(() => {
      store.transaction(() => {
        store.set({ count: 1 });
        store.set({ name: "Grace" });
        throw new Error("abort transaction");
      });
    }).toThrow("abort transaction");

    expect(store.get()).toEqual({ count: 0, name: "Ada" });
    expect(calls).toEqual([]);
  });

  it("skips no-op shallow patches", () => {
    const store = createStore({ count: 0, name: "Ada" });
    let calls = 0;

    store.subscribe(() => {
      calls += 1;
    });
    store.set({ count: 0 });
    store.set({});

    expect(calls).toBe(0);
  });

  it("continues notifying an initial listener snapshot when listeners unsubscribe during notify", () => {
    const store = createStore({ count: 0 });
    const calls: string[] = [];
    let unsubscribeSecond: (() => void) | undefined;

    store.subscribe(() => {
      calls.push("first");
      unsubscribeSecond?.();
    });
    unsubscribeSecond = store.subscribe(() => {
      calls.push("second");
    });
    store.subscribe(() => {
      calls.push("third");
    });

    store.set({ count: 1 });

    expect(calls).toEqual(["first", "second", "third"]);
  });

  it("does not allocate listener snapshots for ordinary notifications", () => {
    const store = createStore({ count: 0 });
    const originalFrom = Array.from;
    store.subscribe(() => {});
    Array.from = ((value: Iterable<unknown> | ArrayLike<unknown>) => {
      if (value instanceof Set) {
        throw new Error("unexpected Set snapshot");
      }
      return originalFrom(value);
    }) as typeof Array.from;

    try {
      store.set({ count: 1 });
    } finally {
      Array.from = originalFrom;
    }
  });

  it("hydrates from a persist descriptor load result", async () => {
    const store = createStore(
      { count: 0 },
      {
        persist: {
          load() {
            return { count: 2 };
          },
          save() {},
        },
      },
    );

    await flushMicrotasks();

    expect(store.get()).toEqual({ count: 2 });
  });

  it("runs persist migrations when the loaded version differs", async () => {
    const store = createStore(
      { count: 0 },
      {
        persist: {
          load() {
            return { state: { count: 1 }, version: 1 };
          },
          migrate(state, version) {
            return { count: state.count + (version ?? 0) };
          },
          save() {},
          version: 2,
        },
      },
    );

    await flushMicrotasks();

    expect(store.get()).toEqual({ count: 2 });
  });

  it("serializes async persist descriptor saves in commit order", async () => {
    let releaseFirst: (() => void) | undefined;
    const saved: number[] = [];
    const store = createStore(
      { count: 0 },
      {
        persist: {
          async save(state) {
            if (state.count === 1) {
              await new Promise<void>((resolve) => {
                releaseFirst = resolve;
              });
            }
            saved.push(state.count);
          },
        },
      },
    );

    store.set({ count: 1 });
    store.set({ count: 2 });
    await flushMicrotasks();
    expect(saved).toEqual([]);
    expect(releaseFirst).toBeDefined();

    releaseFirst?.();
    await flushMicrotasks();

    expect(saved).toEqual([1, 2]);
  });
});

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

describe("shallowEqual", () => {
  it("does not treat distinct built-in objects as equal plain objects", () => {
    expect(shallowEqual(new Date(0), new Date(1_000))).toBe(false);
    expect(shallowEqual(new Map([["a", 1]]), new Map([["b", 2]]))).toBe(false);
  });

  it("does not compare arrays and object-shaped values as the same shape", () => {
    expect(shallowEqual([1, 2], { 0: 1, 1: 2, length: 2 } as never)).toBe(false);
  });

  it("still supports plain objects and arrays", () => {
    expect(shallowEqual({ name: "Ada" }, { name: "Ada" })).toBe(true);
    expect(shallowEqual([1, 2], [1, 2])).toBe(true);
  });
});
