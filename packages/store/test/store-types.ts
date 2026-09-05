import { createStore } from "../src/index.js";

const store = createStore({ count: 0 });

store.transaction(() => {
  store.set({ count: 1 });
});

// @ts-expect-error Store transactions are synchronous and cannot accept async callbacks.
store.transaction(async () => {
  store.set({ count: 2 });
});

// @ts-expect-error Promise-returning callbacks are outside the synchronous transaction contract.
store.transaction(() => Promise.resolve());

const structuralThenable = { then: () => undefined };
// @ts-expect-error Structural thenables are also rejected by the synchronous callback type.
store.transaction(() => structuralThenable);
