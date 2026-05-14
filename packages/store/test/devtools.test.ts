import { afterEach, describe, expect, test } from "vitest";
import { installDevtools, type Devtools } from "@modular-react/devtools";
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
          package: "@modular-react/store",
          state: { count: 1 },
          type: "store:set",
        }),
      ]),
    );
  });
});
