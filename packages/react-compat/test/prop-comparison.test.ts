import { describe, expect, test } from "vitest";
import { createElement, memo } from "../src/index.js";
import {
  areMemoPropsEqual,
  getPendingProps,
  shallowEqual,
} from "../src/prop-comparison.js";

describe("react-compat prop comparison helpers", () => {
  test("compares only own enumerable props with Object.is semantics", () => {
    const inherited = Object.create({ inherited: 1 }) as Record<string, unknown>;
    inherited.value = NaN;

    expect(shallowEqual(inherited, { value: NaN })).toBe(true);
    expect(shallowEqual({ value: 0 }, { value: -0 })).toBe(false);
    expect(shallowEqual({ missing: undefined }, {})).toBe(false);
    expect(shallowEqual({ inherited: 1 }, inherited)).toBe(false);
  });

  test("uses custom memo compare before falling back to shallow equality", () => {
    const Memo = memo(() => null, () => true);
    const DefaultMemo = memo(() => null);

    expect(areMemoPropsEqual(Memo, { value: 1 }, { value: 2 })).toBe(true);
    expect(areMemoPropsEqual(DefaultMemo, { value: 1 }, { value: 1 })).toBe(true);
    expect(areMemoPropsEqual(DefaultMemo, { value: 1 }, { value: 2 })).toBe(false);
  });

  test("adds refs to pending element props only when present", () => {
    const ref = { current: null };

    expect(getPendingProps(createElement("input", { id: "a" }))).toEqual({ id: "a" });
    expect(getPendingProps(createElement("input", { id: "a", ref }))).toEqual({ id: "a", ref });
    expect(getPendingProps("text")).toBe("text");
  });
});
