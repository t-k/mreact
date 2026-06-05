// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest";
import { warnOnDuplicateReactiveCoreCopy } from "../src/duplicate-guard.js";

const duplicateCopyStateKey = "__mreactReactiveCoreCopies";

function spyWarn() {
  return vi.spyOn(console, "warn").mockImplementation(() => {});
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[duplicateCopyStateKey];
  vi.restoreAllMocks();
});

describe("duplicate reactive-core copy guard", () => {
  test("stays silent for the first loaded copy", () => {
    const warn = spyWarn();

    warnOnDuplicateReactiveCoreCopy(
      "http://localhost:5173/node_modules/@reckona/mreact-reactive-core/dist/state.js",
    );

    expect(warn).not.toHaveBeenCalled();
  });

  test("stays silent when the same module re-evaluates with a different query", () => {
    const warn = spyWarn();

    warnOnDuplicateReactiveCoreCopy(
      "http://localhost:5173/node_modules/@reckona/mreact-reactive-core/dist/state.js",
    );
    warnOnDuplicateReactiveCoreCopy(
      "http://localhost:5173/node_modules/@reckona/mreact-reactive-core/dist/state.js?t=1717550000000",
    );

    expect(warn).not.toHaveBeenCalled();
  });

  test("warns once when a second copy loads from a different path", () => {
    const warn = spyWarn();

    warnOnDuplicateReactiveCoreCopy(
      "http://localhost:5173/node_modules/@reckona/mreact-reactive-core/dist/state.js",
    );
    warnOnDuplicateReactiveCoreCopy("http://localhost:5173/node_modules/.vite/deps/chunk-ABCD.js");

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain("Multiple copies of @reckona/mreact-reactive-core");
    expect(message).toContain("/node_modules/@reckona/mreact-reactive-core/dist/state.js");
    expect(message).toContain("/node_modules/.vite/deps/chunk-ABCD.js");
    expect(message).toContain("optimizeDeps.exclude");
  });

  test("does not repeat the warning when an already reported copy re-evaluates", () => {
    const warn = spyWarn();

    warnOnDuplicateReactiveCoreCopy(
      "http://localhost:5173/node_modules/@reckona/mreact-reactive-core/dist/state.js",
    );
    warnOnDuplicateReactiveCoreCopy("http://localhost:5173/node_modules/.vite/deps/chunk-ABCD.js");
    warnOnDuplicateReactiveCoreCopy(
      "http://localhost:5173/node_modules/.vite/deps/chunk-ABCD.js?v=deadbeef",
    );

    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("a second copy of the runtime state module warns on import", async () => {
    const warn = spyWarn();

    warnOnDuplicateReactiveCoreCopy("http://localhost:5173/node_modules/.vite/deps/chunk-ABCD.js");
    vi.resetModules();
    await import("../src/state.js");

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
