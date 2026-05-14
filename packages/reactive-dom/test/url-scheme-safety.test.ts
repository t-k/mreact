// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindProp, bindSpreadProps } from "../src/index.js";

describe("reactive-dom URL scheme guard (Issue 075)", () => {
  test("bindProp drops javascript: from anchor href", async () => {
    const href = cell<string>("https://example.com/");
    const link = document.createElement("a");
    bindProp(link, "href", () => href.get());

    expect(link.getAttribute("href")).toBe("https://example.com/");

    href.set("javascript:alert(1)");
    await flushEffects();

    expect(link.hasAttribute("href")).toBe(false);
    // The DOM property is also cleared so navigation cannot pick up
    // the unsafe value via element.href.
    expect(link.href).not.toContain("javascript:");
  });

  test("bindProp keeps data:image on img src", async () => {
    const src = cell<string>("data:image/png;base64,iVBORw0KGgo=");
    const img = document.createElement("img");
    bindProp(img, "src", () => src.get());

    expect(img.getAttribute("src")).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
  });

  test("bindSpreadProps drops javascript: in href spread", async () => {
    const props = cell<Record<string, unknown>>({
      href: "https://example.com/",
      title: "Hi",
    });
    const link = document.createElement("a");
    bindSpreadProps(link, () => props.get());

    expect(link.getAttribute("href")).toBe("https://example.com/");

    props.set({ href: "javascript:alert(1)", title: "Hi" });
    await flushEffects();

    expect(link.hasAttribute("href")).toBe(false);
    expect(link.getAttribute("title")).toBe("Hi");
  });

  test("bindSpreadProps keeps non-URL attributes unchanged", async () => {
    const props = cell<Record<string, unknown>>({
      title: "javascript:alert(1)",
    });
    const div = document.createElement("div");
    bindSpreadProps(div, () => props.get());

    expect(div.getAttribute("title")).toBe("javascript:alert(1)");
  });
});
