// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindProp, bindSpreadProps } from "../src/index.js";

describe("dangerouslySetInnerHTML", () => {
  test("bindProp applies and reactively updates an own __html string data property", async () => {
    const value = cell<unknown>({ __html: "<strong>first</strong>" });
    const element = document.createElement("div");

    bindProp(element, "dangerouslySetInnerHTML", () => value.get());
    expect(element.innerHTML).toBe("<strong>first</strong>");
    expect(element.hasAttribute("dangerouslySetInnerHTML")).toBe(false);

    value.set({ __html: "<em>second</em>", revision: 2 });
    await flushEffects();
    expect(element.innerHTML).toBe("<em>second</em>");
  });

  test("bindProp clears previous HTML for null, non-string, accessor, and inherited values", async () => {
    const value = cell<unknown>({ __html: "<strong>first</strong>" });
    const element = document.createElement("div");
    bindProp(element, "dangerouslySetInnerHTML", () => value.get());

    for (const invalid of [
      null,
      undefined,
      false,
      "<em>string</em>",
      { __html: 42 },
      Object.defineProperty({}, "__html", { get: () => "<em>getter</em>" }),
      Object.create({ __html: "<em>inherited</em>" }),
    ]) {
      value.set(invalid);
      await flushEffects();
      expect(element.innerHTML).toBe("");

      value.set({ __html: "<i>restored</i>" });
      await flushEffects();
      expect(element.innerHTML).toBe("<i>restored</i>");
    }
  });

  test("does not coerce invalid direct values", () => {
    let coercions = 0;
    const value = {
      toString() {
        coercions += 1;
        return "<script>bad()</script>";
      },
    };
    const element = document.createElement("div");

    bindProp(element, "dangerouslySetInnerHTML", () => value);

    expect(coercions).toBe(0);
    expect(element.innerHTML).toBe("");
  });

  test("bindSpreadProps applies the same exact shape and clears invalid updates", async () => {
    const props = cell<Record<string, unknown>>({
      dangerouslySetInnerHTML: { __html: "<strong>first</strong>" },
    });
    const element = document.createElement("div");

    bindSpreadProps(element, () => props.get());
    expect(element.innerHTML).toBe("<strong>first</strong>");

    props.set({ dangerouslySetInnerHTML: { __html: 1 } });
    await flushEffects();
    expect(element.innerHTML).toBe("");

    props.set({ dangerouslySetInnerHTML: { __html: "<em>second</em>" } });
    await flushEffects();
    expect(element.innerHTML).toBe("<em>second</em>");

    props.set({});
    await flushEffects();
    expect(element.innerHTML).toBe("");
  });
});
