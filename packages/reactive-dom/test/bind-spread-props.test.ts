// @vitest-environment happy-dom

import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { describe, expect, test } from "vitest";
import { bindSpreadProps } from "../src/index.js";

describe("bindSpreadProps", () => {
  test("applies and removes spread attributes", async () => {
    const props = cell<Record<string, unknown>>({
      id: "first",
      className: "primary",
      hidden: true,
    });
    const element = document.createElement("div");
    const dispose = bindSpreadProps(element, () => props.get());

    await flushEffects();

    expect(element.outerHTML).toBe(
      '<div id="first" class="primary" hidden=""></div>',
    );

    props.set({ title: "next" });
    await flushEffects();

    expect(element.outerHTML).toBe('<div title="next"></div>');

    dispose();
  });

  test("clears reflected boolean DOM properties when spread props remove them", async () => {
    const props = cell<Record<string, unknown>>({ hidden: true });
    const element = document.createElement("div");
    const writes: unknown[] = [];
    let reflectedHidden = true;

    Object.defineProperty(element, "hidden", {
      configurable: true,
      get() {
        return reflectedHidden;
      },
      set(value) {
        writes.push(value);
        reflectedHidden = Boolean(value);
      },
    });

    const dispose = bindSpreadProps(element, () => props.get());
    await flushEffects();

    props.set({});
    await flushEffects();

    expect(writes).toEqual([true, false]);
    expect(element.hidden).toBe(false);
    expect(element.hasAttribute("hidden")).toBe(false);

    dispose();
  });

  test("normalizes JSX HTML attribute aliases", async () => {
    const props = cell<Record<string, unknown>>({
      httpEquiv: "refresh",
      charSet: "utf-8",
      crossOrigin: "anonymous",
      tabIndex: 1,
    });
    const element = document.createElement("meta");
    const dispose = bindSpreadProps(element, () => props.get());

    await flushEffects();

    expect(element.getAttribute("http-equiv")).toBe("refresh");
    expect(element.getAttribute("charset")).toBe("utf-8");
    expect(element.getAttribute("crossorigin")).toBe("anonymous");
    expect(element.getAttribute("tabindex")).toBe("1");
    expect(element.hasAttribute("httpEquiv")).toBe(false);
    expect(element.outerHTML).not.toContain("charSet");
    expect(element.outerHTML).not.toContain("crossOrigin");
    expect(element.outerHTML).not.toContain("tabIndex");

    dispose();
  });

  test("treats srcDoc as the dangerous srcdoc attribute alias", async () => {
    const props = cell<Record<string, unknown>>({
      srcDoc: "<script>1</script>",
    });
    const element = document.createElement("iframe");
    const dispose = bindSpreadProps(element, () => props.get());

    await flushEffects();
    expect(element.hasAttribute("srcdoc")).toBe(false);

    props.set({ srcDoc: { __html: "<p>safe</p>" } });
    await flushEffects();
    expect(element.getAttribute("srcdoc")).toBe("<p>safe</p>");

    dispose();
  });

  test("does not rewrite unchanged spread props on reactive re-runs", async () => {
    const trigger = cell(0);
    const props = cell<Record<string, unknown>>({
      className: "primary",
      id: "save",
    });
    const element = document.createElement("button");
    const writes: string[] = [];
    const setAttribute = element.setAttribute.bind(element);
    const removeAttribute = element.removeAttribute.bind(element);
    element.setAttribute = ((name, value) => {
      writes.push(`set:${name}:${value}`);
      setAttribute(name, value);
    }) as typeof element.setAttribute;
    element.removeAttribute = ((name) => {
      writes.push(`remove:${name}`);
      removeAttribute(name);
    }) as typeof element.removeAttribute;

    const dispose = bindSpreadProps(element, () => {
      trigger.get();
      return props.get();
    });
    await flushEffects();

    expect(writes).toEqual(["set:class:primary", "set:id:save"]);

    trigger.set(1);
    await flushEffects();

    expect(writes).toEqual(["set:class:primary", "set:id:save"]);

    props.set({ className: "secondary", id: "save" });
    await flushEffects();

    expect(writes).toEqual(["set:class:primary", "set:id:save", "set:class:secondary"]);

    dispose();
  });
});
