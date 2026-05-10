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
});
