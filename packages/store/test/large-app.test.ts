import { describe, expect, it } from "vitest";
import { effect } from "@modular-react/reactive-core";
import { flushEffects } from "@modular-react/reactive-core/testing";
import { createRequestStoreFactory, createStore, shallowEqual } from "../src/index.js";

describe("store large-app capabilities", () => {
  it("supports selector equality for object slices", async () => {
    const store = createStore({ count: 0, name: "Ada" });
    const profile = store.select((state) => ({ name: state.name }), shallowEqual);
    const seen: Array<{ name: string }> = [];

    effect(() => {
      seen.push(profile.get());
    });
    store.set({ count: 1 });
    store.set({ name: "Grace" });
    await flushEffects();

    expect(seen).toEqual([{ name: "Ada" }, { name: "Grace" }]);
  });

  it("batches subscriber notifications in a transaction", () => {
    const store = createStore({ count: 0, name: "Ada" });
    const calls: Array<[{ count: number; name: string }, { count: number; name: string }]> = [];

    store.subscribe((state, previous) => {
      calls.push([state, previous]);
    });
    store.transaction(() => {
      store.set({ count: 1 });
      store.set({ name: "Grace" });
    });

    expect(calls).toEqual([
      [
        { count: 1, name: "Grace" },
        { count: 0, name: "Ada" },
      ],
    ]);
  });

  it("creates isolated request-scoped stores", () => {
    const createRequestStore = createRequestStoreFactory(() => ({ count: 0 }));
    const first = createRequestStore();
    const second = createRequestStore();

    first.set({ count: 1 });

    expect(first.get()).toEqual({ count: 1 });
    expect(second.get()).toEqual({ count: 0 });
  });

  it("notifies persistence and instrumentation hooks without loading adapters", () => {
    const persisted: unknown[] = [];
    const events: string[] = [];
    const store = createStore(
      { count: 0 },
      {
        instrument(event) {
          events.push(event.type);
        },
        persist(state) {
          persisted.push(state);
        },
      },
    );

    store.set({ count: 1 });
    store.transaction(() => {
      store.set({ count: 2 });
      store.set({ count: 3 });
    });

    expect(persisted).toEqual([{ count: 1 }, { count: 3 }]);
    expect(events).toEqual(["set", "transaction"]);
  });
});
