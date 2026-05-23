import { describe, expect, test } from "vitest";
import { getServerRuntimeState } from "../src/runtime-state.js";

describe("getServerRuntimeState", () => {
  test("shares state through globalThis instead of module-local singletons", () => {
    const first = getServerRuntimeState("test-runtime", () => ({ count: 0 }));
    first.count += 1;
    const second = getServerRuntimeState("test-runtime", () => ({ count: 0 }));

    expect(second).toBe(first);
    expect(second.count).toBe(1);
  });
});
