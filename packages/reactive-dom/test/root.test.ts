// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindText, createRoot } from "../src/index.js";

const reactCompatElementType = Symbol.for("react.transitional.element");

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

  test("applies compat element props through the DOM prop safety policy", () => {
    const container = document.createElement("main");
    const calls: string[] = [];

    const dispose = createRoot(container, () => ({
      $$typeof: reactCompatElementType,
      type: "a",
      props: {
        children: "safe",
        className: "link",
        href: "javascript:alert(1)",
        onClick() {
          calls.push("clicked");
        },
      },
    }));

    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("href")).toBeNull();
    expect(anchor?.className).toBe("link");

    anchor?.click();
    expect(calls).toEqual(["clicked"]);

    dispose();
  });

  test("requires dangerous HTML opt-in for compat srcDoc props", () => {
    const container = document.createElement("main");

    const dispose = createRoot(container, () => ({
      $$typeof: reactCompatElementType,
      type: "iframe",
      props: {
        srcDoc: "<script>window.pwned = true</script>",
      },
    }));

    const iframe = container.querySelector("iframe");
    expect(iframe?.hasAttribute("srcdoc")).toBe(false);

    dispose();
  });

  test("throws a bounded error for deeply nested render values", () => {
    const container = document.createElement("main");
    let value: unknown = "leaf";

    for (let index = 0; index < 300; index += 1) {
      value = [value];
    }

    expect(() => createRoot(container, () => value as never)).toThrow(/render value is too deep/i);
  });
});
