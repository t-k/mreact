// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, test } from "vitest";
import { useSyncExternalStoreWithSelector } from "./use-sync-external-store-shim.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("React Flow useSyncExternalStore selector shim", () => {
  test("keeps the last successful selection when a transient store update makes the selector throw", async () => {
    const container = document.createElement("div");
    let snapshot = { lookup: new Map([["node", "ready"]]) };
    const listeners = new Set<() => void>();

    function subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function App() {
      const selection = useSyncExternalStoreWithSelector(
        subscribe,
        () => snapshot,
        undefined,
        (state) => {
          const value = state.lookup.get("node");
          if (value === undefined) {
            throw new Error("node lookup is temporarily unavailable");
          }

          return value;
        },
      );

      return createElement("span", null, selection);
    }

    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(App, null));
    });
    expect(container.innerHTML).toBe("<span>ready</span>");
    expect(listeners.size).toBe(1);

    snapshot = { lookup: new Map() };
    await expect(
      act(async () => {
        for (const listener of Array.from(listeners)) {
          listener();
        }
      }),
    ).resolves.toBeUndefined();

    expect(container.innerHTML).toBe("<span>ready</span>");
  });
});
