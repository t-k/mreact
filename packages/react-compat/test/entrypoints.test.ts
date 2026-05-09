import { describe, expect, test } from "vitest";
import {
  Fragment,
  createElement,
  createRoot,
  render,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "../src/index.js";

describe("react-compat entrypoints", () => {
  test("exports the Phase 7 public API", () => {
    expect(Fragment).toBeDefined();
    expect(createElement).toBeTypeOf("function");
    expect(createRoot).toBeTypeOf("function");
    expect(render).toBeTypeOf("function");
    expect(useState).toBeTypeOf("function");
    expect(useRef).toBeTypeOf("function");
    expect(useMemo).toBeTypeOf("function");
    expect(useCallback).toBeTypeOf("function");
  });
});
