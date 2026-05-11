import { describe, expect, test } from "vitest";
import {
  Fragment,
  createElement,
  useState,
  version,
} from "../src/index.js";
import { jsx, jsxs } from "../src/jsx-runtime.js";
import { jsxDEV } from "../src/jsx-dev-runtime.js";

describe("react drop-in entrypoint", () => {
  test("exports React-compatible core and JSX runtime shape", () => {
    expect(createElement("span", null, "Ada").type).toBe("span");
    expect(Fragment).toBeDefined();
    expect(useState).toBeTypeOf("function");
    expect(version).toBeTypeOf("string");
    expect(jsx("span", { children: "Ada" }).type).toBe("span");
    expect(jsxs("div", { children: [jsx("span", { children: "A" })] }).type).toBe("div");
    expect(jsxDEV("button", { children: "Save" }, undefined, false, undefined, undefined).type)
      .toBe("button");
  });
});
