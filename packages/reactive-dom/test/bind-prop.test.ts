// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindProp } from "../src/index.js";

describe("bindProp", () => {
  test("updates DOM properties", async () => {
    const disabled = cell(false);
    const button = document.createElement("button");

    bindProp(button, "disabled", () => disabled.get());

    expect(button.disabled).toBe(false);

    disabled.set(true);
    await flushEffects();

    expect(button.disabled).toBe(true);
  });

  test("removes boolean attributes left by server HTML when the bound DOM property becomes false", async () => {
    const hidden = cell(true);
    const item = document.createElement("li");

    item.setAttribute("hidden", "");
    bindProp(item, "hidden", () => hidden.get());

    expect(item.hidden).toBe(true);
    expect(item.hasAttribute("hidden")).toBe(true);

    hidden.set(false);
    await flushEffects();

    expect(item.hidden).toBe(false);
    expect(item.hasAttribute("hidden")).toBe(false);
  });

  test("clears reflected boolean DOM properties when a bound value becomes false", async () => {
    const hidden = cell(true);
    const item = document.createElement("li");
    const writes: unknown[] = [];
    let reflectedHidden = true;

    Object.defineProperty(item, "hidden", {
      configurable: true,
      get() {
        return reflectedHidden;
      },
      set(value) {
        writes.push(value);
        reflectedHidden = Boolean(value);
      },
    });

    item.setAttribute("hidden", "");
    bindProp(item, "hidden", () => hidden.get());

    hidden.set(false);
    await flushEffects();

    expect(writes).toEqual([true, false]);
    expect(item.hidden).toBe(false);
    expect(item.hasAttribute("hidden")).toBe(false);
  });

  test("updates attributes and removes nullish values", async () => {
    const label = cell<string | null>("Save");
    const button = document.createElement("button");

    bindProp(button, "aria-label", () => label.get());

    expect(button.getAttribute("aria-label")).toBe("Save");

    label.set(null);
    await flushEffects();

    expect(button.hasAttribute("aria-label")).toBe(false);
  });

  test("skips DOM writes when the derived value is unchanged", async () => {
    const trigger = cell(0);
    const label = cell("Save");
    const button = document.createElement("button");
    let writes = 0;
    const setAttribute = button.setAttribute.bind(button);
    button.setAttribute = ((name, value) => {
      writes += 1;
      setAttribute(name, value);
    }) as typeof button.setAttribute;

    bindProp(button, "aria-label", () => {
      trigger.get();
      return label.get();
    });

    expect(writes).toBe(1);

    trigger.set(1);
    await flushEffects();

    expect(writes).toBe(1);
    expect(button.getAttribute("aria-label")).toBe("Save");
  });

  test("normalizes JSX HTML attribute aliases", async () => {
    const value = cell("refresh");
    const meta = document.createElement("meta");

    bindProp(meta, "httpEquiv", () => value.get());
    await flushEffects();

    expect(meta.getAttribute("http-equiv")).toBe("refresh");
    expect(meta.hasAttribute("httpEquiv")).toBe(false);

    value.set("content-type");
    await flushEffects();

    expect(meta.getAttribute("http-equiv")).toBe("content-type");
  });

  test("treats srcDoc as the dangerous srcdoc attribute alias", async () => {
    const value = cell<unknown>("<script>1</script>");
    const iframe = document.createElement("iframe");

    bindProp(iframe, "srcDoc", () => value.get());
    await flushEffects();
    expect(iframe.hasAttribute("srcdoc")).toBe(false);

    value.set({ __html: "<p>safe</p>" });
    await flushEffects();
    expect(iframe.getAttribute("srcdoc")).toBe("<p>safe</p>");
  });

  test("sets dynamic SVG geometry attributes through attributes instead of readonly properties", async () => {
    const viewBox = cell("0 0 24 24");
    const className = cell("icon");
    const width = cell(24);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");

    expect(() => bindProp(svg, "viewBox", () => viewBox.get())).not.toThrow();
    expect(() => bindProp(svg, "className", () => className.get())).not.toThrow();
    expect(() => bindProp(rect, "width", () => width.get())).not.toThrow();

    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("class")).toBe("icon");
    expect(rect.getAttribute("width")).toBe("24");

    viewBox.set("0 0 48 48");
    className.set("icon icon-large");
    width.set(48);
    await flushEffects();

    expect(svg.getAttribute("viewBox")).toBe("0 0 48 48");
    expect(svg.getAttribute("class")).toBe("icon icon-large");
    expect(rect.getAttribute("width")).toBe("48");
  });
});
