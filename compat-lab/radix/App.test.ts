// @vitest-environment happy-dom

import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "./App.js";

describe("Radix compat lab app", () => {
  afterEach(() => {
    document.body.replaceChildren();
    window.history.replaceState(null, "", "/");
    window.__COMPAT_LAB_RUNTIME__ = undefined;
  });

  test("keeps the visible fixture surface independent of runtime labels", async () => {
    window.history.replaceState(null, "", "/?fixture=radix-dialog-initial-closed");
    window.__COMPAT_LAB_RUNTIME__ = "compat";
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    flushSync(() => {
      root.render(createElement(App));
    });

    expect(document.body.textContent).toContain("Dialog initial closed state");
    expect(document.body.textContent).not.toContain("compat");

    root.unmount();
  });
});
