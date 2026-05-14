// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindText, createRoot } from "../src/index.js";

describe("createRoot", () => {
  test("mounts render output and clears it on dispose", () => {
    const container = document.createElement("main");

    const dispose = createRoot(container, () => {
      const text = document.createTextNode("hello");
      return text;
    });

    expect(container.textContent).toBe("hello");

    dispose();
    dispose();

    expect(container.textContent).toBe("");
  });

  test("disposes bindings registered while rendering", async () => {
    const container = document.createElement("main");
    const count = cell(0);

    const dispose = createRoot(container, () => {
      const text = document.createTextNode("");
      bindText(text, () => count.get());
      return text;
    });

    expect(container.textContent).toBe("0");

    count.set(1);
    await flushEffects();
    expect(container.textContent).toBe("1");

    dispose();
    count.set(2);
    await flushEffects();

    expect(container.textContent).toBe("");
  });
});
