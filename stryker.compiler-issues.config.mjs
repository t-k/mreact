import { createStrykerConfig } from "./stryker.base.config.mjs";

// Bounded mutation profile for the 2026-09-07 compiler review issues. The
// generic compiler profile does not mutate these files or line ranges, so a
// green run of stryker.compiler.config.mjs says nothing about them.
export default createStrykerConfig({
  name: "compiler-issues",
  breakThreshold: 80,
  mutate: [
    // 20260907-compiler-expression-facts
    "packages/compiler/src/expression-facts.ts",
    "packages/compiler/src/oxc-expression-facts.ts",
    "packages/compiler/src/oxc-child-analysis.ts:684-688",
    "packages/compiler/src/oxc-child-analysis.ts:1889-1895",
    "packages/compiler/src/oxc-child-analysis.ts:1901-1901",
    "packages/compiler/src/oxc.ts:250-250",
    "packages/compiler/src/oxc.ts:1954-1958",
    // 20260907-compiler-direct-cell-text
    "packages/compiler/src/emit-client.ts:918-923",
    "packages/compiler/src/emit-client.ts:1579-1584",
  ],
  testFiles: [
    "packages/compiler/test/expression-facts.test.ts",
    "packages/compiler/test/oxc-expression-facts.test.ts",
    "packages/compiler/test/direct-cell-text.test.ts",
    "packages/compiler/test/internal-ir.test.ts",
    "packages/compiler/test/oxc-parity.test.ts",
    "packages/compiler/test/conformance.test.ts",
    "packages/compiler/test/client-runtime-dynamic.test.ts",
    "packages/compiler/test/text-separator.test.ts",
  ],
});
