import { describe, expect, test } from "vitest";
import {
  isServerRenderValue,
  readServerRenderValue,
  registerServerRenderValue,
} from "../src/server-render-value-internal.js";

describe("server render-value internal registry", () => {
  test("accepts only exact identities registered in module-private state", () => {
    const value = registerServerRenderValue("<b>safe</b>");
    const forged = Object.create(null) as object;

    expect(isServerRenderValue(value)).toBe(true);
    expect(readServerRenderValue(value)).toBe("<b>safe</b>");
    expect(isServerRenderValue(forged)).toBe(false);
    expect(
      (globalThis as typeof globalThis & Record<symbol, unknown>)[
        Symbol.for("@reckona/mreact.server-render-value-registry")
      ],
    ).toBeUndefined();
  });
});
