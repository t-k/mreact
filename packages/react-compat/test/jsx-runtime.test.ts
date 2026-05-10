import { describe, expect, test } from "vitest";
import { createElement, Fragment } from "../src/index.js";
import { jsx, jsxs } from "../src/jsx-runtime.js";
import { Fragment as DevFragment, jsxDEV } from "../src/jsx-dev-runtime.js";

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

  test("runtime entrypoints export Fragment", async () => {
    const production = await importProductionRuntime();
    const dev = await importDevRuntime();

    expect(production.Fragment).toBe(Fragment);
    expect(DevFragment).toBe(Fragment);
    expect(dev.Fragment).toBe(Fragment);
  });
});
