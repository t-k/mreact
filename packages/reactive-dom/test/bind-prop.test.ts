// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@modular-react/reactive-core";
import { flushEffects } from "@modular-react/reactive-core/testing";
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

  test("updates attributes and removes nullish values", async () => {
    const label = cell<string | null>("Save");
    const button = document.createElement("button");

    bindProp(button, "aria-label", () => label.get());

    expect(button.getAttribute("aria-label")).toBe("Save");

    label.set(null);
    await flushEffects();

    expect(button.hasAttribute("aria-label")).toBe(false);
  });
});
