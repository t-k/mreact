// @vitest-environment happy-dom

import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { describe, expect, test } from "vitest";
import { bindSpreadProps, withPropBindingMetadata } from "../src/index.js";

interface RetargetableElement extends HTMLElement {
  __mreactPropBindings?: Array<{ retarget(element: Element): void }>;
}

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

    expect(element.outerHTML).toBe('<div id="first" class="primary" hidden=""></div>');

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

  test("removes a false booleanish attribute when the spread prop is omitted", async () => {
    const props = cell<Record<string, unknown>>({ "aria-expanded": false });
    const element = document.createElement("div");
    const dispose = bindSpreadProps(element, () => props.get());

    await flushEffects();
    expect(element.getAttribute("aria-expanded")).toBe("false");

    props.set({});
    await flushEffects();
    expect(element.hasAttribute("aria-expanded")).toBe(false);

    dispose();
  });

  test("applies opted-in inner HTML while ignoring unsupported spread-only props", async () => {
    const props = cell<Record<string, unknown>>({
      dangerouslySetInnerHTML: { __html: "<span>bad</span>" },
      onClick: "alert(1)",
      onclick: "alert(2)",
      suppressHydrationWarning: true,
      title: "safe",
    });
    const element = document.createElement("div");
    const dispose = bindSpreadProps(element, () => props.get());

    await flushEffects();

    expect(element.innerHTML).toBe("<span>bad</span>");
    expect(element.hasAttribute("onClick")).toBe(false);
    expect(element.hasAttribute("onclick")).toBe(false);
    expect(element.hasAttribute("suppressHydrationWarning")).toBe(false);
    expect(element.getAttribute("title")).toBe("safe");

    dispose();
  });

  test("binds function event handlers from spread props while dropping string event attributes", async () => {
    const calls: string[] = [];
    const props = cell<Record<string, unknown>>({
      onClick: () => calls.push("first"),
      onclick: "alert(1)",
    });
    const element = document.createElement("button");
    const dispose = bindSpreadProps(element, () => props.get());

    await flushEffects();

    element.click();
    expect(calls).toEqual(["first"]);
    expect(element.hasAttribute("onclick")).toBe(false);

    props.set({
      onClick: () => calls.push("second"),
      onmouseover: "alert(2)",
    });
    await flushEffects();

    element.click();
    expect(calls).toEqual(["first", "second"]);
    expect(element.hasAttribute("onmouseover")).toBe(false);

    dispose();

    element.click();
    expect(calls).toEqual(["first", "second"]);
  });

  test("skips form value props from spread bindings", async () => {
    const props = cell<Record<string, unknown>>({
      value: "Ada",
      checked: true,
      defaultValue: "initial",
      defaultChecked: true,
      title: "safe",
    });
    const input = document.createElement("input");
    const dispose = bindSpreadProps(input, () => props.get());

    await flushEffects();

    expect(input.value).toBe("");
    expect(input.checked).toBe(false);
    expect(input.defaultValue).toBe("");
    expect(input.defaultChecked).toBe(false);
    expect(input.getAttribute("title")).toBe("safe");

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

  test("tracks props read after retargeting spread bindings", async () => {
    const initialTitle = cell("initial");
    const hydratedTitle = cell("hydrated");
    const source = document.createElement("div") as RetargetableElement;
    const target = document.createElement("div");
    let retargeted = false;

    const dispose = withPropBindingMetadata(() =>
      bindSpreadProps(source, () =>
        retargeted ? { title: hydratedTitle.get() } : { title: initialTitle.get() },
      ),
    );
    await flushEffects();

    expect(source.getAttribute("title")).toBe("initial");

    retargeted = true;
    source.__mreactPropBindings?.[0]?.retarget(target);

    expect(source.hasAttribute("title")).toBe(false);
    expect(target.getAttribute("title")).toBe("hydrated");

    hydratedTitle.set("updated");
    await flushEffects();

    expect(target.getAttribute("title")).toBe("updated");

    dispose();
  });
});
