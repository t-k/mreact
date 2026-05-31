import { describe, expect, it } from "vitest";
import { effect } from "@reckona/mreact-reactive-core";
import { withCleanupScope } from "@reckona/mreact-reactive-core/internal";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { createStore } from "../src/index.js";

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
});
