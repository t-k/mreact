import { describe, expect, test } from "vitest";
import { escapeHtmlBatch } from "../src/native-escape.js";

describe("escapeHtmlBatch (JS fallback)", () => {
  test("escapes the four core HTML characters in each entry", () => {
    expect(escapeHtmlBatch(['a & b', '"q"', "<x>"])).toEqual([
      "a &amp; b",
      "&quot;q&quot;",
      "&lt;x&gt;",
    ]);
  });

  test("coerces null/undefined entries into an empty string before escaping", () => {
    expect(escapeHtmlBatch([null, undefined, 0, 1])).toEqual(["", "", "0", "1"]);
  });

  test("returns an empty array for an empty input", () => {
    expect(escapeHtmlBatch([])).toEqual([]);
  });

  test("is idempotent on already-escaped values", () => {
    expect(escapeHtmlBatch(["&amp;"])).toEqual(["&amp;amp;"]);
  });
});
