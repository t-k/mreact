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
    "packages/compiler/src/oxc-child-analysis.ts:691-691",
    "packages/compiler/src/oxc-child-analysis.ts:1893-1898",
    "packages/compiler/src/oxc-child-analysis.ts:1905-1905",
    "packages/compiler/src/oxc.ts:250-250",
    "packages/compiler/src/oxc.ts:1954-1958",
    // Decision and emission helpers for all three client specializations.
    "packages/compiler/src/emit-client-specialization.ts",
    // Their call sites inside the client emitter.
    "packages/compiler/src/emit-client.ts:254-258",
    "packages/compiler/src/emit-client.ts:266-270",
    "packages/compiler/src/emit-client.ts:301-315",
    "packages/compiler/src/emit-client.ts:556-556",
    "packages/compiler/src/emit-client.ts:739-768",
    "packages/compiler/src/emit-client.ts:811-825",
    "packages/compiler/src/emit-client.ts:946-951",
    "packages/compiler/src/emit-client.ts:957-965",
    // 20260907-compiler-unused-component-initialization
    "packages/compiler/src/emit-client.ts:497-502",
    "packages/compiler/src/emit-client.ts:581-594",
    // 20260907-compiler-select-binding
    "packages/reactive-dom/src/bind-select-value.ts",
    // 20260907-compiler-branch-specialization
    "packages/reactive-dom/src/insert-branch.ts",
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
    "packages/compiler/test/select-binding.test.ts",
    "packages/reactive-dom/test/bind-select-value.test.ts",
    "packages/reactive-dom/test/bind-spread-props.test.ts",
    "packages/compiler/test/branch-specialization.test.ts",
    "packages/reactive-dom/test/insert-branch.test.ts",
    "packages/compiler/test/transform-dynamic.test.ts",
    "packages/compiler/test/component-initialization.test.ts",
    "packages/compiler/test/transform-static.test.ts",
  ],
});
