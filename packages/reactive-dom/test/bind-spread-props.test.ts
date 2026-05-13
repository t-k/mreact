// @vitest-environment happy-dom

import { cell } from "@modular-react/reactive-core";
import { flushEffects } from "@modular-react/reactive-core/testing";
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
});
