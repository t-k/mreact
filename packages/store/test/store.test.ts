import { describe, expect, it } from "vitest";
import { effect } from "@reckona/mreact-reactive-core";
import { withCleanupScope } from "@reckona/mreact-reactive-core/internal";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { createStore, persistedStoreState, shallowEqual } from "../src/index.js";

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

  it("does not notify a duplicate listener after either subscription is unsubscribed", () => {
    const store = createStore({ count: 0 });
    let calls = 0;
    const listener = () => {
      calls += 1;
    };

    store.subscribe(listener);
    const unsubscribeDuplicate = store.subscribe(listener);
    unsubscribeDuplicate();
    store.set({ count: 1 });

    expect(calls).toBe(0);
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

  it("does not compact the listener entry array once per cleanup-scope unsubscribe", () => {
    const store = createStore({ count: 0 });
    const disposers: Array<() => void> = [];
    const originalFilter = Array.prototype.filter;
    let filterCalls = 0;

    for (let index = 0; index < 200; index += 1) {
      withCleanupScope(
        (dispose) => {
          disposers.push(dispose);
        },
        () => store.select((state) => state.count),
      );
    }

    Array.prototype.filter = function filterSpy<T>(
      this: T[],
      ...args: Parameters<Array<T>["filter"]>
    ) {
      filterCalls += 1;
      return originalFilter.apply(this, args);
    } as typeof Array.prototype.filter;

    try {
      for (const dispose of disposers) {
        dispose();
      }
    } finally {
      Array.prototype.filter = originalFilter;
    }

    expect(filterCalls).toBeLessThanOrEqual(2);
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

  it("preserves raw persisted state that has state and version domain fields", async () => {
    const store = createStore(
      { state: { status: "new" }, version: 0, workspace: "initial" },
      {
        persist: {
          load() {
            return { state: { status: "open" }, version: 1, workspace: "alpha" };
          },
        },
      },
    );

    await flushMicrotasks();

    expect(store.get()).toEqual({ state: { status: "open" }, version: 1, workspace: "alpha" });
  });

  it("does not overwrite a local commit made while persistence hydration is pending", async () => {
    let resolveLoad: ((state: { count: number }) => void) | undefined;
    const store = createStore(
      { count: 0 },
      {
        persist: {
          load() {
            return new Promise<{ count: number }>((resolve) => {
              resolveLoad = resolve;
            });
          },
        },
      },
    );

    store.set({ count: 1 });
    resolveLoad?.({ count: 2 });
    await flushMicrotasks();

    expect(store.get()).toEqual({ count: 1 });
  });

  it("exposes persistence load failures without an unhandled rejection", async () => {
    const failure = new Error("load failed");
    const store = createStore(
      { count: 0 },
      { persist: { load: async () => Promise.reject(failure) } },
    );

    await store.persistence.ready;

    expect(store.persistence.status.get()).toBe("error");
    expect(store.persistence.error.get()).toEqual({ error: failure, phase: "load" });
  });

  it("runs persist migrations when the loaded version differs", async () => {
    const migrations: Array<[{ count: number }, number | undefined]> = [];
    const store = createStore(
      { count: 0 },
      {
        persist: {
          load() {
            return persistedStoreState({ count: 1 }, 1);
          },
          migrate(state, version) {
            migrations.push([state, version]);
            return { count: state.count + (version ?? 0) };
          },
          save() {},
          version: 2,
        },
      },
    );

    await flushMicrotasks();

    expect(store.get()).toEqual({ count: 2 });
    expect(migrations).toEqual([[{ count: 1 }, 1]]);
  });

  it("coalesces pending async persist descriptor saves to the latest state", async () => {
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
    store.set({ count: 3 });
    await flushMicrotasks();
    expect(saved).toEqual([]);
    expect(releaseFirst).toBeDefined();

    releaseFirst?.();
    await flushMicrotasks();

    expect(saved).toEqual([1, 3]);
  });

  it("continues coalesced persist descriptor saves after a rejected save", async () => {
    const saved: number[] = [];
    const store = createStore(
      { count: 0 },
      {
        persist: {
          async save(state) {
            if (state.count === 1) {
              throw new Error("fixture save failed");
            }
            saved.push(state.count);
          },
        },
      },
    );

    store.set({ count: 1 });
    await flushMicrotasks();
    store.set({ count: 2 });
    store.set({ count: 3 });
    await flushMicrotasks();

    expect(saved).toEqual([2, 3]);
    expect(store.persistence.status.get()).toBe("error");
    expect(store.persistence.error.get()).toMatchObject({ phase: "save" });
  });

  it("does not overwrite an observed save failure when hydration later completes", async () => {
    let resolveLoad: ((state: { count: number }) => void) | undefined;
    const failure = new Error("save failed during hydration");
    const store = createStore(
      { count: 0 },
      {
        persist: {
          load: () =>
            new Promise<{ count: number }>((resolve) => {
              resolveLoad = resolve;
            }),
          save: async () => Promise.reject(failure),
        },
      },
    );

    store.set({ count: 1 });
    await flushMicrotasks();
    expect(store.persistence.status.get()).toBe("error");
    expect(store.persistence.error.get()).toEqual({ error: failure, phase: "save" });

    resolveLoad?.({ count: 2 });
    await store.persistence.ready;

    expect(store.persistence.status.get()).toBe("error");
    expect(store.persistence.error.get()).toEqual({ error: failure, phase: "save" });
  });

  it("continues after a queued save rejection without persisting the next state twice", async () => {
    let releaseFirst: (() => void) | undefined;
    let rejectThird: ((error: Error) => void) | undefined;
    const attempts: number[] = [];
    const saved: number[] = [];
    const store = createStore(
      { count: 0 },
      {
        persist: {
          async save(state) {
            attempts.push(state.count);
            if (state.count === 1) {
              await new Promise<void>((resolve) => {
                releaseFirst = resolve;
              });
            }
            if (state.count === 3) {
              await new Promise<void>((_resolve, reject) => {
                rejectThird = reject;
              });
            }
            saved.push(state.count);
          },
        },
      },
    );

    store.set({ count: 1 });
    store.set({ count: 2 });
    store.set({ count: 3 });
    await flushMicrotasks();
    releaseFirst?.();
    await flushMicrotasks();
    expect(attempts).toEqual([1, 3]);

    store.set({ count: 4 });
    rejectThird?.(new Error("queued save failed"));
    await flushMicrotasks();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await flushMicrotasks();

    expect(attempts).toEqual([1, 3, 4]);
    expect(saved).toEqual([1, 4]);
    expect(store.persistence.error.get()).toMatchObject({ phase: "save" });
  });

  it("migrates an explicitly accepted legacy persisted record", async () => {
    const migrations: Array<[{ count: number }, number | undefined]> = [];
    const store = createStore(
      { count: 0 },
      {
        persist: {
          acceptLegacyPersistedState: true,
          load: () => ({ state: { count: 1 }, version: 1 }),
          migrate: (state, version) => {
            migrations.push([state, version]);
            return { count: state.count + (version ?? 0) };
          },
          version: 2,
        },
      },
    );

    await store.persistence.ready;

    expect(store.get()).toEqual({ count: 2 });
    expect(migrations).toEqual([[{ count: 1 }, 1]]);
  });

  it("uses an explicit replace hydration conflict policy", async () => {
    let resolveLoad: ((state: { count: number }) => void) | undefined;
    const store = createStore(
      { count: 0 },
      {
        persist: {
          hydrationConflict: "replace",
          load: () =>
            new Promise<{ count: number }>((resolve) => {
              resolveLoad = resolve;
            }),
        },
      },
    );

    store.set({ count: 1 });
    resolveLoad?.({ count: 2 });
    await store.persistence.ready;

    expect(store.get()).toEqual({ count: 2 });
  });

  it("merges or custom-resolves persisted state after a local hydration commit", async () => {
    let resolveMergedLoad:
      | ((state: { count: number; local: string; loadedOnly?: string; server: string }) => void)
      | undefined;
    const merged = createStore<{
      count: number;
      local: string;
      loadedOnly?: string;
      server: string;
    }>(
      { count: 0, local: "initial", server: "none" },
      {
        persist: {
          hydrationConflict: "merge",
          load: () =>
            new Promise<{ count: number; local: string; loadedOnly?: string; server: string }>(
              (resolve) => {
                resolveMergedLoad = resolve;
              },
            ),
        },
      },
    );
    merged.set({ local: "new" });
    resolveMergedLoad?.({ count: 2, local: "persisted", loadedOnly: "loaded", server: "loaded" });
    await merged.persistence.ready;

    expect(merged.get()).toEqual({ count: 0, local: "new", loadedOnly: "loaded", server: "none" });

    let resolveCustomLoad: ((state: { count: number }) => void) | undefined;
    const custom = createStore(
      { count: 0 },
      {
        persist: {
          hydrationConflict: (loaded, current) => ({ count: loaded.count + current.count }),
          load: () =>
            new Promise<{ count: number }>((resolve) => {
              resolveCustomLoad = resolve;
            }),
        },
      },
    );
    custom.set({ count: 3 });
    resolveCustomLoad?.({ count: 2 });
    await custom.persistence.ready;

    expect(custom.get()).toEqual({ count: 5 });
  });

  it("treats only tagged envelopes as persistence metadata without legacy opt-in", async () => {
    const primitive = createStore(
      { value: "initial" },
      { persist: { load: () => ({ value: "loaded" }) } },
    );
    const untagged = createStore<{ state: { value: string }; version: number }>(
      { state: { value: "initial" }, version: 0 },
      { persist: { load: () => ({ state: { value: "loaded" }, version: 2 }) } },
    );
    const tagged = createStore(
      { value: "initial" },
      { persist: { load: () => persistedStoreState({ value: "tagged" }, 2) } },
    );

    await Promise.all([
      primitive.persistence.ready,
      untagged.persistence.ready,
      tagged.persistence.ready,
    ]);

    expect(primitive.get()).toEqual({ value: "loaded" });
    expect(untagged.get()).toEqual({ state: { value: "loaded" }, version: 2 });
    expect(tagged.get()).toEqual({ value: "tagged" });
  });

  it.each([
    {
      initial: { state: "initial", version: 0 },
      loaded: { state: "loaded", version: 1 },
      name: "primitive nested state",
    },
    {
      initial: { state: { value: "initial" } },
      loaded: { state: { value: "loaded" } },
      name: "missing version",
    },
    {
      initial: { state: { value: "initial" }, version: 0, workspace: "initial" },
      loaded: { state: { value: "loaded" }, version: 1, workspace: "alpha" },
      name: "extra domain keys",
    },
  ])("keeps $name as raw persisted domain state", async ({ initial, loaded }) => {
    const store = createStore(initial, { persist: { load: () => loaded } });

    await store.persistence.ready;

    expect(store.get()).toEqual(loaded);
  });

  it("preserves tagged-looking raw domain state when it has additional fields", async () => {
    const store = createStore<{
      __mreactStorePersistedState: true;
      state: { status: string };
      version: number;
      workspace: string;
    }>(
      {
        __mreactStorePersistedState: true as const,
        state: { status: "new" },
        version: 0,
        workspace: "initial",
      },
      {
        persist: {
          load: () => ({
            __mreactStorePersistedState: true as const,
            state: { status: "open" },
            version: 1,
            workspace: "alpha",
          }),
        },
      },
    );

    await store.persistence.ready;

    expect(store.get()).toEqual({
      __mreactStorePersistedState: true,
      state: { status: "open" },
      version: 1,
      workspace: "alpha",
    });
  });

  it("reports migration failures separately from load failures", async () => {
    const failure = new Error("migration failed");
    const store = createStore(
      { count: 0 },
      {
        persist: {
          load: () => persistedStoreState({ count: 1 }, 1),
          migrate: async () => Promise.reject(failure),
          version: 2,
        },
      },
    );

    await store.persistence.ready;

    expect(store.persistence.error.get()).toEqual({ error: failure, phase: "migrate" });
  });

  it("coalesces pending async persist callback saves to the latest state", async () => {
    let releaseFirst: (() => void) | undefined;
    const saved: number[] = [];
    const store = createStore(
      { count: 0 },
      {
        persist: async (state) => {
          if (state.count === 1) {
            await new Promise<void>((resolve) => {
              releaseFirst = resolve;
            });
          }
          saved.push(state.count);
        },
      },
    );

    store.set({ count: 1 });
    store.set({ count: 2 });
    store.set({ count: 3 });
    await flushMicrotasks();
    expect(saved).toEqual([]);
    expect(releaseFirst).toBeDefined();

    releaseFirst?.();
    await flushMicrotasks();

    expect(saved).toEqual([1, 3]);
  });

  it("keeps write-only persistence callback shorthand ready while exposing save failures", async () => {
    const failure = new Error("callback save failed");
    const store = createStore({ count: 0 }, { persist: async () => Promise.reject(failure) });

    expect(store.persistence.status.get()).toBe("hydrating");
    await store.persistence.ready;
    expect(store.persistence.status.get()).toBe("ready");
    store.set({ count: 1 });
    await flushMicrotasks();

    expect(store.persistence.status.get()).toBe("error");
    expect(store.persistence.error.get()).toEqual({ error: failure, phase: "save" });
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
