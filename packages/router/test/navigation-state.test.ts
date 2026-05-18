// @vitest-environment happy-dom

import { afterEach, describe, expect, test } from "vitest";
import {
  getNavigationState,
  subscribeNavigationState,
  type AppRouterNavigationState,
} from "../src/navigation-state.js";

describe("router navigation state helpers", () => {
  afterEach(() => {
    delete (globalThis as { __mreactNavigationState?: unknown }).__mreactNavigationState;
    document.documentElement.removeAttribute("data-mreact-navigation-pending");
    document.documentElement.removeAttribute("data-mreact-navigation-from");
    document.documentElement.removeAttribute("data-mreact-navigation-to");
    document.documentElement.removeAttribute("data-mreact-navigation-type");
  });

  test("reads the runtime navigation state when available", () => {
    const current: AppRouterNavigationState = {
      from: "https://example.test/",
      pending: true,
      to: "https://example.test/about",
      type: "push",
    };
    (globalThis as { __mreactNavigationState?: { current: AppRouterNavigationState } })
      .__mreactNavigationState = { current };

    expect(getNavigationState()).toEqual(current);
  });

  test("falls back to DOM attributes", () => {
    document.documentElement.setAttribute("data-mreact-navigation-pending", "true");
    document.documentElement.setAttribute("data-mreact-navigation-from", "https://example.test/");
    document.documentElement.setAttribute("data-mreact-navigation-to", "https://example.test/about");
    document.documentElement.setAttribute("data-mreact-navigation-type", "push");

    expect(getNavigationState()).toEqual({
      from: "https://example.test/",
      pending: true,
      to: "https://example.test/about",
      type: "push",
    });
  });

  test("subscribes to navigation state changes", () => {
    const states: AppRouterNavigationState[] = [];
    const unsubscribe = subscribeNavigationState((state) => {
      states.push(state);
    });

    window.dispatchEvent(new CustomEvent("mreact:navigation-state-change", {
      detail: {
        from: "https://example.test/",
        pending: true,
        to: "https://example.test/about",
        type: "replace",
      },
    }));
    unsubscribe();
    window.dispatchEvent(new CustomEvent("mreact:navigation-state-change", {
      detail: {
        from: "https://example.test/about",
        pending: true,
        to: "https://example.test/",
        type: "pop",
      },
    }));

    expect(states).toEqual([
      {
        from: "https://example.test/",
        pending: true,
        to: "https://example.test/about",
        type: "replace",
      },
    ]);
  });
});
