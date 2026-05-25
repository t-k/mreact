import { describe, expect, test } from "vitest";
import { compilerOutputContractVersion } from "../src/compiler-contract.js";

describe("compiler output contract", () => {
  test("exposes a versioned shared compiler/router/server seam", () => {
    expect(compilerOutputContractVersion).toBe(1);
  });
});
