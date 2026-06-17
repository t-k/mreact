import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { createElement, Fragment } from "../src/index.js";
import {
  jsx,
  jsxs,
  REACTIVE_STATE_BINDING_META,
  REACTIVE_TEXT_BINDING_META,
} from "../src/jsx-runtime.js";
import {
  Fragment as DevFragment,
  REACTIVE_STATE_BINDING_META as DEV_REACTIVE_STATE_BINDING_META,
  REACTIVE_TEXT_BINDING_META as DEV_REACTIVE_TEXT_BINDING_META,
  jsxDEV,
} from "../src/jsx-dev-runtime.js";

async function importProductionRuntime(): Promise<
  typeof import("../src/jsx-runtime.js")
> {
  return import("../src/jsx-runtime.js");
}

async function importDevRuntime(): Promise<
  typeof import("../src/jsx-dev-runtime.js")
> {
  return import("../src/jsx-dev-runtime.js");
}

describe("react-compat automatic JSX runtime", () => {
  test("jsx returns the same element model as createElement", () => {
    const element = jsx("button", { className: "primary", children: "Save" });

    expect(element).toEqual(
      createElement("button", { className: "primary" }, "Save"),
    );
  });

  test("jsxs preserves array children", () => {
    const element = jsxs("div", {
      children: [jsx("span", { children: "A" }), jsx("span", { children: "B" })],
    });

    expect(element.props.children).toEqual([
      createElement("span", null, "A"),
      createElement("span", null, "B"),
    ]);
  });

  test("jsx does not mutate the input props object", () => {
    const props = { className: "primary", children: "Save", key: "props-key" };

    jsx("button", props, "arg-key");

    expect(props).toEqual({
      className: "primary",
      children: "Save",
      key: "props-key",
    });
  });

  test("jsx preserves symbol metadata props used by compiler output", () => {
    const binding = { value: "Save" };
    const element = jsx("button", {
      [REACTIVE_TEXT_BINDING_META]: binding,
      children: "Save",
    });

    expect((element.props as Record<PropertyKey, unknown>)[REACTIVE_TEXT_BINDING_META])
      .toBe(binding);
  });

  test("jsx runtime does not spread props before createElement", async () => {
    const source = await readFile(
      new URL("../src/jsx-runtime.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("{ ...props }");
  });

  test("jsxs does not mutate the input props object", () => {
    const children = [jsx("span", { children: "A" })];
    const props = { id: "items", children };

    jsxs("div", props);

    expect(props).toEqual({ id: "items", children });
  });

  test("jsx preserves explicit undefined children outside props", () => {
    const element = jsx("div", { id: "root", children: undefined });

    expect(element).toEqual(createElement("div", { id: "root" }, undefined));
    expect(Object.hasOwn(element.props, "children")).toBe(true);
    expect(element.props.children).toBeUndefined();
  });

  test("jsxs preserves explicit undefined children outside props", () => {
    const element = jsxs("div", { id: "root", children: undefined });

    expect(element).toEqual(createElement("div", { id: "root" }, undefined));
    expect(Object.hasOwn(element.props, "children")).toBe(true);
    expect(element.props.children).toBeUndefined();
  });

  test("jsx stores third argument key outside props", () => {
    const element = jsx("li", { key: "props-key", children: "Item" }, "arg-key");

    expect(element.key).toBe("arg-key");
    expect("key" in element.props).toBe(false);
  });

  test("jsxDEV accepts the React dev runtime signature", () => {
    const element = jsxDEV(
      "section",
      { id: "intro", children: "Hello" },
      "dev-key",
      false,
      { fileName: "App.tsx", lineNumber: 1, columnNumber: 10 },
      undefined,
    );

    expect(element.type).toBe("section");
    expect(element.key).toBe("dev-key");
    expect(element.props).toEqual({ id: "intro", children: "Hello" });
  });

  test("jsxDEV drops React dev metadata when it is included in props", () => {
    const element = jsxDEV(
      "a",
      {
        href: "/msgs",
        __self: { component: "Trans" },
        __source: { fileName: "Trans.jsx", lineNumber: 12 },
        children: "there",
      },
      undefined,
      false,
      undefined,
      undefined,
    );

    expect(element.props).toEqual({ href: "/msgs", children: "there" });
    expect("__self" in element.props).toBe(false);
    expect("__source" in element.props).toBe(false);
  });

  test("runtime entrypoints export Fragment", async () => {
    const production = await importProductionRuntime();
    const dev = await importDevRuntime();

    expect(production.Fragment).toBe(Fragment);
    expect(DevFragment).toBe(Fragment);
    expect(dev.Fragment).toBe(Fragment);
  });

  test("runtime entrypoints export reactive binding metadata", async () => {
    const production = await importProductionRuntime();
    const dev = await importDevRuntime();

    expect(production.REACTIVE_TEXT_BINDING_META).toBe(REACTIVE_TEXT_BINDING_META);
    expect(DEV_REACTIVE_TEXT_BINDING_META).toBe(REACTIVE_TEXT_BINDING_META);
    expect(dev.REACTIVE_TEXT_BINDING_META).toBe(REACTIVE_TEXT_BINDING_META);
    expect(production.REACTIVE_STATE_BINDING_META).toBe(REACTIVE_STATE_BINDING_META);
    expect(DEV_REACTIVE_STATE_BINDING_META).toBe(REACTIVE_STATE_BINDING_META);
    expect(dev.REACTIVE_STATE_BINDING_META).toBe(REACTIVE_STATE_BINDING_META);
  });
});
