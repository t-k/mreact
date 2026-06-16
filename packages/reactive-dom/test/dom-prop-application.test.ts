// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import {
  applyDomProp,
  registerReactivePropBinding,
  removeDomProp,
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

    const disposeFirst = registerReactivePropBinding(div, firstBinding);
    const bindings = div.__mreactPropBindings;

    const disposeSecond = registerReactivePropBinding(div, secondBinding);

    expect(div.__mreactPropBindings).toBe(bindings);
    expect(div.__mreactPropBindings).toEqual([firstBinding, secondBinding]);

    disposeSecond();
    disposeFirst();
  });

  test("normalizes JSX aliases for property-preferred and attribute-preferred entrypoints", () => {
    const label = document.createElement("label");
    const meta = document.createElement("meta");

    applyDomProp(label, "htmlFor", "name", { preferProperty: true });
    applyDomProp(meta, "httpEquiv", "refresh", { preferProperty: false });

    expect(label.getAttribute("for")).toBe("name");
    expect(meta.getAttribute("http-equiv")).toBe("refresh");
    expect(label.hasAttribute("htmlFor")).toBe(false);
    expect(meta.hasAttribute("httpEquiv")).toBe(false);
  });

  test("removes falsey values and clears reflected boolean DOM properties", () => {
    const button = document.createElement("button");

    applyDomProp(button, "disabled", true, { preferProperty: true });
    expect(button.disabled).toBe(true);
    expect(button.hasAttribute("disabled")).toBe(true);

    applyDomProp(button, "disabled", false, { preferProperty: true });
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  test("filters unsafe URL values while keeping safe URL attributes", () => {
    const link = document.createElement("a");

    applyDomProp(link, "href", "https://safe.example/", { preferProperty: true });
    expect(link.getAttribute("href")).toBe("https://safe.example/");

    applyDomProp(link, "href", "javascript:alert(1)", { preferProperty: true });
    expect(link.getAttribute("href")).toBeNull();
    expect(link.href).toBe("");
  });

  test("filters unsafe srcset values while keeping safe candidates", () => {
    const image = document.createElement("img");

    applyDomProp(image, "srcSet", "/safe.png 1x, https://safe.example/safe.png 2x", {
      preferProperty: false,
    });
    expect(image.getAttribute("srcset")).toBe(
      "/safe.png 1x, https://safe.example/safe.png 2x",
    );

    applyDomProp(image, "srcSet", "javascript:alert(1) 1x, /safe.png 2x", {
      preferProperty: false,
    });
    expect(image.getAttribute("srcset")).toBeNull();
  });

  test("filters unsafe imagesrcset values", () => {
    const link = document.createElement("link");

    applyDomProp(link, "imagesrcset", "javascript:alert(1) 1x, /safe.png 2x", {
      preferProperty: false,
    });

    expect(link.getAttribute("imagesrcset")).toBeNull();
  });

  test("requires explicit dangerous HTML opt-in for srcDoc", () => {
    const iframe = document.createElement("iframe");

    applyDomProp(iframe, "srcDoc", "<script>1</script>", { preferProperty: false });
    expect(iframe.hasAttribute("srcdoc")).toBe(false);

    applyDomProp(iframe, "srcDoc", { __html: "<p>safe</p>" }, { preferProperty: false });
    expect(iframe.getAttribute("srcdoc")).toBe("<p>safe</p>");
  });

  test("applies style objects through the style declaration and removes attributes consistently", () => {
    const div = document.createElement("div");

    applyDomProp(div, "style", { color: "red", backgroundColor: "blue" }, { preferProperty: true });
    expect(div.style.color).toBe("red");
    expect(div.style.backgroundColor).toBe("blue");

    removeDomProp(div, "style");
    expect(div.getAttribute("style")).toBeNull();
  });

  test("clears style object properties omitted by the next object", () => {
    const div = document.createElement("div");

    applyDomProp(div, "style", { color: "red", backgroundColor: "blue" }, { preferProperty: true });
    applyDomProp(div, "style", { color: "red" }, { preferProperty: true });

    expect(div.style.color).toBe("red");
    expect(div.style.backgroundColor).toBe("");
  });

  test("clears custom style properties omitted by the next object", () => {
    const div = document.createElement("div");

    applyDomProp(div, "style", { "--accent": "red" }, { preferProperty: true });
    applyDomProp(div, "style", {}, { preferProperty: true });

    expect(div.style.getPropertyValue("--accent")).toBe("");
  });

  test("clears falsey style object values", () => {
    const div = document.createElement("div");

    applyDomProp(div, "style", { color: "red", backgroundColor: "blue" }, { preferProperty: true });
    applyDomProp(div, "style", { color: null, backgroundColor: false }, { preferProperty: true });

    expect(div.style.color).toBe("");
    expect(div.style.backgroundColor).toBe("");
  });
});
