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

  test("normalizes JSX HTML attribute aliases", async () => {
    const value = cell("refresh");
    const meta = document.createElement("meta");

    bindProp(meta, "httpEquiv", () => value.get());
    await flushEffects();

    expect(meta.getAttribute("http-equiv")).toBe("refresh");
    expect(meta.hasAttribute("httpEquiv")).toBe(false);

    value.set("content-type");
    await flushEffects();

    expect(meta.getAttribute("http-equiv")).toBe("content-type");
  });

  test("treats srcDoc as the dangerous srcdoc attribute alias", async () => {
    const value = cell<unknown>("<script>1</script>");
    const iframe = document.createElement("iframe");

    bindProp(iframe, "srcDoc", () => value.get());
    await flushEffects();
    expect(iframe.hasAttribute("srcdoc")).toBe(false);

    value.set({ __html: "<p>safe</p>" });
    await flushEffects();
    expect(iframe.getAttribute("srcdoc")).toBe("<p>safe</p>");
  });
});
