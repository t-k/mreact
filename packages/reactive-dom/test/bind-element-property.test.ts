// @vitest-environment happy-dom

import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { describe, expect, test } from "vitest";
import { bindElementProperty } from "../src/bind-element-property.js";
import { bindProp, withPropBindingMetadata } from "../src/index.js";

interface RetargetableElement extends Element {
  __mreactPropBindings?: Array<{ retarget(element: Element): void }>;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const valueSequence: readonly unknown[] = [
  "first",
  "second",
  null,
  "third",
  undefined,
  false,
  true,
  0,
  42,
  "",
  { toString: () => "stringified" },
  "javascript:alert(1)",
  'quote" injected',
  "line\nbreak",
  42n,
];

describe("bindElementProperty", () => {
  test("matches bindProp for every value shape on a property-backed name", async () => {
    for (const [property, attribute, propName] of [
      ["className", "class", "className"],
      ["dir", "dir", "dir"],
      ["id", "id", "id"],
      ["lang", "lang", "lang"],
      ["slot", "slot", "slot"],
      ["title", "title", "title"],
    ] as const) {
      const specializedValue = cell<unknown>(valueSequence[0]);
      const genericValue = cell<unknown>(valueSequence[0]);
      const specialized = document.createElement("div");
      const generic = document.createElement("div");
      const disposeSpecialized = bindElementProperty(specialized, property, attribute, () =>
        specializedValue.get(),
      );
      const disposeGeneric = bindProp(generic, propName, () => genericValue.get());

      for (const next of valueSequence) {
        specializedValue.set(next);
        genericValue.set(next);
        await flushEffects();

        expect(specialized.outerHTML, `${property}:${String(next)}`).toBe(generic.outerHTML);
        expect(
          (specialized as unknown as Record<string, unknown>)[property],
          `${property}:${String(next)}`,
        ).toBe((generic as unknown as Record<string, unknown>)[property]);
      }

      disposeSpecialized();
      disposeGeneric();
    }
  });

  test("matches bindProp for an attribute-only name", async () => {
    const specializedValue = cell<unknown>(valueSequence[0]);
    const genericValue = cell<unknown>(valueSequence[0]);
    const specialized = document.createElement("div");
    const generic = document.createElement("div");
    const disposeSpecialized = bindElementProperty(specialized, "class", "class", () =>
      specializedValue.get(),
    );
    const disposeGeneric = bindProp(generic, "class", () => genericValue.get());

    for (const next of valueSequence) {
      specializedValue.set(next);
      genericValue.set(next);
      await flushEffects();

      expect(specialized.outerHTML, String(next)).toBe(generic.outerHTML);
    }

    disposeSpecialized();
    disposeGeneric();
  });

  test("matches bindProp on an SVG element by writing attributes only", async () => {
    const specializedValue = cell<unknown>(valueSequence[0]);
    const genericValue = cell<unknown>(valueSequence[0]);
    const specialized = document.createElementNS(SVG_NAMESPACE, "g");
    const generic = document.createElementNS(SVG_NAMESPACE, "g");
    const disposeSpecialized = bindElementProperty(specialized, "className", "class", () =>
      specializedValue.get(),
    );
    const disposeGeneric = bindProp(generic, "className", () => genericValue.get());

    for (const next of valueSequence) {
      specializedValue.set(next);
      genericValue.set(next);
      await flushEffects();

      expect(specialized.getAttribute("class"), String(next)).toBe(generic.getAttribute("class"));
    }

    disposeSpecialized();
    disposeGeneric();
  });

  test("writes the accessor of a custom element that defines an allowlisted name", async () => {
    const value = cell<unknown>("first");
    const seen: unknown[] = [];
    const element = document.createElement("div");
    Object.defineProperty(element, "slot", {
      configurable: true,
      get: () => seen[seen.length - 1],
      set: (next: unknown) => {
        seen.push(next);
      },
    });
    const dispose = bindElementProperty(element, "slot", "slot", () => value.get());

    await flushEffects();

    expect(seen).toEqual(["first"]);
    expect(element.hasAttribute("slot")).toBe(false);

    dispose();
  });

  test("removes the property and attribute when the value carries a DOM node", async () => {
    const value = cell<unknown>("first");
    const element = document.createElement("div");
    const dispose = bindElementProperty(element, "id", "id", () => value.get());

    await flushEffects();
    expect(element.outerHTML).toBe('<div id="first"></div>');

    value.set({ nested: [document.createElement("span")] });
    await flushEffects();

    expect(element.outerHTML).toBe("<div></div>");
    expect(element.id).toBe("");

    dispose();
  });

  test("skips reapplication when the bound value does not change", async () => {
    const revision = cell(0);
    const element = document.createElement("div");
    const dispose = bindElementProperty(element, "className", "class", () => {
      revision.get();
      return "stable";
    });

    await flushEffects();
    element.className = "touched";
    revision.set(1);
    await flushEffects();

    expect(element.className).toBe("touched");

    dispose();
  });

  test("reapplies the property to a retargeted element", async () => {
    const value = cell<unknown>("first");
    const element = document.createElement("div");
    const next = document.createElement("div");
    const dispose = withPropBindingMetadata(() =>
      bindElementProperty(element, "id", "id", () => value.get()),
    );

    await flushEffects();
    expect(element.id).toBe("first");

    const bindings = (element as RetargetableElement).__mreactPropBindings;

    expect(bindings).toHaveLength(1);
    bindings?.[0]?.retarget(next);

    expect(next.id).toBe("first");

    value.set("second");
    await flushEffects();
    expect(next.id).toBe("second");

    dispose();
  });

  test("stops writing after disposal", async () => {
    const value = cell<unknown>("first");
    const element = document.createElement("div");
    const dispose = bindElementProperty(element, "id", "id", () => value.get());

    await flushEffects();
    dispose();
    value.set("second");
    await flushEffects();

    expect(element.id).toBe("first");
  });
});
