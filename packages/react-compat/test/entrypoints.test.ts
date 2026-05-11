import { describe, expect, test } from "vitest";
import {
  Component,
  Fragment,
  PureComponent,
  createElement,
  createRef,
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
    expect(Component).toBeTypeOf("function");
    expect(PureComponent).toBeTypeOf("function");
    expect(createElement).toBeTypeOf("function");
    expect(createRef).toBeTypeOf("function");
    expect(createRoot).toBeTypeOf("function");
    expect(render).toBeTypeOf("function");
    expect(useState).toBeTypeOf("function");
    expect(useRef).toBeTypeOf("function");
    expect(useMemo).toBeTypeOf("function");
    expect(useCallback).toBeTypeOf("function");
  });
});
