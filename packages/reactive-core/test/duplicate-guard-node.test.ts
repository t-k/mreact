import { afterEach, describe, expect, test, vi } from "vitest";
import { warnOnDuplicateReactiveCoreCopy } from "../src/duplicate-guard.js";

const duplicateCopyStateKey = "__mreactReactiveCoreCopies";

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[duplicateCopyStateKey];
  vi.restoreAllMocks();
});

describe("duplicate reactive-core copy guard outside the browser", () => {
  test("never warns and never writes global state without a document", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    warnOnDuplicateReactiveCoreCopy("file:///first/copy/state.js");
    warnOnDuplicateReactiveCoreCopy("file:///second/copy/state.js");

    expect(warn).not.toHaveBeenCalled();
    expect(duplicateCopyStateKey in globalThis).toBe(false);
  });
});
