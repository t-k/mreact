import { afterEach, describe, expect, test } from "vitest";
import { installDevtools, type Devtools } from "@reckona/mreact-devtools";
import { createStore } from "../src/index.js";

let activeDevtools: Devtools | undefined;

afterEach(() => {
  activeDevtools?.dispose();
  activeDevtools = undefined;
});

describe("store devtools instrumentation", () => {
  test("emits opt-in store update events through the global devtools hook", () => {
    const devtools = installDevtools();
    activeDevtools = devtools;
    const store = createStore({ count: 0 });

    store.set({ count: 1 });

    expect(devtools.events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          package: "@reckona/mreact-store",
          state: { count: 1 },
          type: "store:set",
        }),
      ]),
    );
  });

  test("emits hydration notifications without immediately saving the loaded state", async () => {
    let resolveLoad: ((state: { count: number }) => void) | undefined;
    const devtools = installDevtools();
    activeDevtools = devtools;
    const instrumented: string[] = [];
    const saved: number[] = [];
    const notified: Array<[{ count: number }, { count: number }]> = [];
    const store = createStore(
      { count: 0 },
      {
        instrument: (event) => instrumented.push(event.type),
        persist: {
          load: () => new Promise<{ count: number }>((resolve) => {
            resolveLoad = resolve;
          }),
          save: (state) => {
            saved.push(state.count);
          },
        },
      },
    );
    store.subscribe((state, previous) => notified.push([state, previous]));

    resolveLoad?.({ count: 2 });
    await store.persistence.ready;

    expect(notified).toEqual([[{ count: 2 }, { count: 0 }]]);
    expect(instrumented).toEqual(["replace"]);
    expect(saved).toEqual([]);
    expect(devtools.events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          package: "@reckona/mreact-store",
          state: { count: 2 },
          type: "store:replace",
        }),
      ]),
    );
  });
});
