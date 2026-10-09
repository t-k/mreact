import { expect, test } from "vitest";
import { createContext, createElement, useContext } from "../src/index.js";
import { renderToString } from "../src/server-render.js";

const Theme = createContext<string | null | undefined>("fallback");
function Label() {
  return createElement("output", null, String(useContext(Theme)));
}

test("SSR restores a shared module Context across nested providers and requests", () => {
  for (const value of ["first", "second", null, undefined]) {
    const html = renderToString(() =>
      createElement(
        Theme.Provider,
        { value },
        createElement(Label),
        createElement(Theme.Provider, { value: "nested" }, createElement(Label)),
        createElement(Label),
      ),
    );
    expect(html).toBe(
      `<output>${String(value)}</output><output>nested</output><output>${String(value)}</output>`,
    );
    expect(renderToString(Label)).toBe("<output>fallback</output>");
    expect(Theme.values).toEqual([]);
  }
});

test("SSR restores a shared module Context after a provider throws", () => {
  const failure = new Error("render failed");
  function Throw() {
    expect(useContext(Theme)).toBe("nested");
    throw failure;
  }
  expect(() =>
    renderToString(() =>
      createElement(
        Theme.Provider,
        { value: "outer" },
        createElement(Theme.Provider, { value: "nested" }, createElement(Throw)),
      ),
    ),
  ).toThrow(failure);
  expect(renderToString(Label)).toBe("<output>fallback</output>");
  expect(Theme.values).toEqual([]);
});
