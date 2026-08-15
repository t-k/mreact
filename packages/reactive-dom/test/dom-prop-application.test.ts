// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import {
  applyDomProp,
  registerReactivePropBinding,
  removeDomProp,
  withPropBindingMetadata,
} from "../src/dom-prop-application.js";

describe("DOM prop application policy", () => {
  test("appends reactive prop bindings without replacing the binding array", () => {
    const div = document.createElement("div") as HTMLDivElement & {
      __mreactPropBindings?: unknown[];
    };
    const firstBinding = {
      dispose() {},
      retarget() {},
    };
    const secondBinding = {
      dispose() {},
      retarget() {},
    };

    const disposeFirst = withPropBindingMetadata(() =>
      registerReactivePropBinding(div, firstBinding),
    );
    const bindings = div.__mreactPropBindings;

    const disposeSecond = withPropBindingMetadata(() =>
      registerReactivePropBinding(div, secondBinding),
    );

    expect(div.__mreactPropBindings).toBe(bindings);
    expect(div.__mreactPropBindings).toEqual([firstBinding, secondBinding]);

    disposeSecond();
    disposeFirst();
  });

  test("normalizes JSX aliases for property-preferred and attribute-preferred entrypoints", () => {
    const label = document.createElement("label");
    const meta = document.createElement("meta");

    applyDomProp(label, "htmlFor", "name", true);
    applyDomProp(meta, "httpEquiv", "refresh", false);

    expect(label.getAttribute("for")).toBe("name");
    expect(meta.getAttribute("http-equiv")).toBe("refresh");
    expect(label.hasAttribute("htmlFor")).toBe(false);
    expect(meta.hasAttribute("httpEquiv")).toBe(false);
  });

  test("normalizes camel-cased JSX aliases on SVG elements", () => {
    const image = document.createElementNS("http://www.w3.org/2000/svg", "image");

    applyDomProp(image, "crossOrigin", "anonymous", false);

    expect(image.getAttribute("crossorigin")).toBe("anonymous");
    expect(image.hasAttribute("crossOrigin")).toBe(false);
  });

  test("treats Object prototype member names as ordinary attributes", () => {
    const div = document.createElement("div");
    const names = [
      "constructor",
      "toString",
      "__proto__",
      "valueOf",
      "hasOwnProperty",
      "isPrototypeOf",
      "propertyIsEnumerable",
      "toLocaleString",
    ];

    for (const preferProperty of [false, true]) {
      for (const name of names) {
        const inheritedValue = (div as unknown as Record<string, unknown>)[name];
        expect(() => applyDomProp(div, name, `value:${name}`, preferProperty)).not.toThrow();
        expect(div.getAttribute(name)).toBe(`value:${name}`);
        expect(Object.hasOwn(div, name)).toBe(false);
        expect((div as unknown as Record<string, unknown>)[name]).toBe(inheritedValue);
        expect(() => removeDomProp(div, name)).not.toThrow();
        expect(div.getAttribute(name)).toBeNull();
        expect(Object.hasOwn(div, name)).toBe(false);
        expect((div as unknown as Record<string, unknown>)[name]).toBe(inheritedValue);
      }
    }
  });

  test("drops unsafe mixed-case URL and HTML attributes", () => {
    const link = document.createElement("a");
    const frame = document.createElement("iframe");

    applyDomProp(link, "HREF", "javascript:alert(1)", false);
    applyDomProp(frame, "SRCDOC", "<script>1</script>", false);

    expect(link.hasAttribute("href")).toBe(false);
    expect(frame.hasAttribute("srcdoc")).toBe(false);
  });

  test("ignores invalid attribute names without throwing", () => {
    const div = document.createElement("div");

    expect(() => applyDomProp(div, "bad name", "value", false)).not.toThrow();
    expect(() => removeDomProp(div, "bad name")).not.toThrow();
    expect(div.outerHTML).toBe("<div></div>");
  });

  test("drops event-like props regardless of name casing", () => {
    const image = document.createElement("img");
    image.setAttribute("onerror", "oldHandler() ");
    image.onerror = () => undefined;

    for (const name of ["onError", "onerror", "ONERROR", "OnErRoR"]) {
      expect(() => applyDomProp(image, name, "globalThis.__pwned = true", true)).not.toThrow();
      expect(image.hasAttribute("onerror")).toBe(false);
      expect(image.onerror).toBeNull();
    }
  });

  test("serializes booleanish attributes as literal tokens", () => {
    const div = document.createElement("div");

    for (const name of [
      "aria-expanded",
      "data-open",
      "spellCheck",
      "draggable",
      "contentEditable",
      "translate",
      "autoCapitalize",
    ]) {
      applyDomProp(div, name, true, true);
      expect(div.getAttribute(name)).toBe("true");
      applyDomProp(div, name, false, true);
      expect(div.getAttribute(name)).toBe("false");
    }

    applyDomProp(div, "hidden", true, true);
    expect(div.getAttribute("hidden")).toBe("");
    applyDomProp(div, "hidden", false, true);
    expect(div.getAttribute("hidden")).toBeNull();
  });

  test("clears constrained DOM properties by removing their attributes", () => {
    const editable = document.createElement("div");
    const input = document.createElement("input");

    applyDomProp(editable, "contentEditable", true, true);
    expect(() => applyDomProp(editable, "contentEditable", null, true)).not.toThrow();
    expect(editable.hasAttribute("contenteditable")).toBe(false);

    applyDomProp(input, "size", 12, true);
    expect(() => applyDomProp(input, "size", undefined, true)).not.toThrow();
    expect(input.hasAttribute("size")).toBe(false);
  });

  test("removes falsey values and clears reflected boolean DOM properties", () => {
    const button = document.createElement("button");

    applyDomProp(button, "disabled", true, true);
    expect(button.disabled).toBe(true);
    expect(button.hasAttribute("disabled")).toBe(true);

    applyDomProp(button, "disabled", false, true);
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  test("filters unsafe URL values while keeping safe URL attributes", () => {
    const link = document.createElement("a");

    applyDomProp(link, "href", "https://safe.example/", true);
    expect(link.getAttribute("href")).toBe("https://safe.example/");

    applyDomProp(link, "href", "javascript:alert(1)", true);
    expect(link.getAttribute("href")).toBeNull();
    expect(link.href).toBe("");
  });

  test("filters unsafe srcset values while keeping safe candidates", () => {
    const image = document.createElement("img");

    applyDomProp(image, "srcSet", "/safe.png 1x, https://safe.example/safe.png 2x", false);
    expect(image.getAttribute("srcset")).toBe("/safe.png 1x, https://safe.example/safe.png 2x");

    applyDomProp(image, "srcSet", "javascript:alert(1) 1x, /safe.png 2x", false);
    expect(image.getAttribute("srcset")).toBeNull();
  });

  test("filters unsafe imagesrcset values", () => {
    const link = document.createElement("link");

    applyDomProp(link, "imagesrcset", "javascript:alert(1) 1x, /safe.png 2x", false);

    expect(link.getAttribute("imagesrcset")).toBeNull();
  });

  test("requires explicit dangerous HTML opt-in for srcDoc", () => {
    const iframe = document.createElement("iframe");

    applyDomProp(iframe, "srcDoc", "<script>1</script>", false);
    expect(iframe.hasAttribute("srcdoc")).toBe(false);

    applyDomProp(iframe, "srcDoc", { __html: "<p>safe</p>" }, false);
    expect(iframe.getAttribute("srcdoc")).toBe("<p>safe</p>");
  });

  test("applies style objects through the style declaration and removes attributes consistently", () => {
    const div = document.createElement("div");

    applyDomProp(div, "style", { color: "red", backgroundColor: "blue" }, true);
    expect(div.style.color).toBe("red");
    expect(div.style.backgroundColor).toBe("blue");

    removeDomProp(div, "style");
    expect(div.getAttribute("style")).toBeNull();
  });

  test("clears style object properties omitted by the next object", () => {
    const div = document.createElement("div");

    applyDomProp(div, "style", { color: "red", backgroundColor: "blue" }, true);
    applyDomProp(div, "style", { color: "red" }, true);

    expect(div.style.color).toBe("red");
    expect(div.style.backgroundColor).toBe("");
  });

  test("clears custom style properties omitted by the next object", () => {
    const div = document.createElement("div");

    applyDomProp(div, "style", { "--accent": "red" }, true);
    applyDomProp(div, "style", {}, true);

    expect(div.style.getPropertyValue("--accent")).toBe("");
  });

  test("clears falsey style object values", () => {
    const div = document.createElement("div");

    applyDomProp(div, "style", { color: "red", backgroundColor: "blue" }, true);
    applyDomProp(div, "style", { color: null, backgroundColor: false }, true);

    expect(div.style.color).toBe("");
    expect(div.style.backgroundColor).toBe("");
  });
});
