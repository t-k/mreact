import { createStore, persistedStoreState } from "../src/index.js";

const store = createStore({ count: 0 });

const readonlyStore = createStore({ profile: { name: "Ada" }, tags: ["reactive"] });
const readonlyState = readonlyStore.view.get();
// @ts-expect-error Readonly store views reject nested writes.
readonlyState.profile.name = "Grace";
// @ts-expect-error Readonly store views reject array mutation.
readonlyState.tags.push("query");

const snapshot = readonlyStore.snapshot();
snapshot.profile.name = "Grace";

store.transaction(() => {
  store.set({ count: 1 });
});

const migratedStore = createStore<{ count: number }, { countText: string }>(
  { count: 0 },
  {
    persist: {
      load: () => persistedStoreState({ countText: "1" }, 1),
      migrate: (state) => ({ count: Number(state.countText) }),
      version: 2,
    },
  },
);
void migratedStore;

// @ts-expect-error Store transactions are synchronous and cannot accept async callbacks.
store.transaction(async () => {
  store.set({ count: 2 });
});

// @ts-expect-error Promise-returning callbacks are outside the synchronous transaction contract.
store.transaction(() => Promise.resolve());

const structuralThenable = { then: () => undefined };
// @ts-expect-error Structural thenables are also rejected by the synchronous callback type.
store.transaction(() => structuralThenable);

const syncOrAsyncCallback: () => void | Promise<void> = () =>
  Math.random() > -1 ? undefined : Promise.resolve();
// @ts-expect-error A callback whose return may be a thenable is not synchronous.
store.transaction(syncOrAsyncCallback);
