import { describe, expect, test } from "vitest";
import {
  isServerRenderValue,
  readServerRenderValue,
  registerServerRenderValue,
  registerServerRenderThunk,
} from "../src/server-render-value-internal.js";

describe("server render-value internal registry", () => {
  test("registers only the exact compiler thunk without allocating a coercion wrapper", () => {
    const thunk = (selected: string) => `<option>${selected}</option>`;
    const forged = Object.assign(() => "<script>forged</script>", thunk);
    expect(isServerRenderValue(thunk)).toBe(false);
    expect(registerServerRenderThunk(thunk)).toBe(thunk);
    expect(readServerRenderValue(thunk)).toBe(thunk);
    expect(isServerRenderValue(thunk)).toBe(true);
    expect(isServerRenderValue(forged)).toBe(false);
    expect(Object.hasOwn(thunk, Symbol.toPrimitive)).toBe(false);
  });
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
