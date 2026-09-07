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
    "packages/compiler/src/oxc-child-analysis.ts:694-696",
    "packages/compiler/src/oxc-child-analysis.ts:1898-1903",
    "packages/compiler/src/oxc-child-analysis.ts:1910-1910",
    "packages/compiler/src/oxc.ts:261-261",
    "packages/compiler/src/oxc.ts:1978-1982",
    // Decision and emission helpers for all three client specializations.
    "packages/compiler/src/emit-client-specialization.ts",
    // Their call sites inside the client emitter.
    "packages/compiler/src/emit-client.ts:271-275",
    "packages/compiler/src/emit-client.ts:279-283",
    "packages/compiler/src/emit-client.ts:314-336",
    "packages/compiler/src/emit-client.ts:585-585",
    "packages/compiler/src/emit-client.ts:799-828",
    "packages/compiler/src/emit-client.ts:875-889",
    "packages/compiler/src/emit-client.ts:1010-1015",
    "packages/compiler/src/emit-client.ts:1021-1029",
    // 20260907-compiler-unused-component-initialization
    "packages/compiler/src/emit-client.ts:521-526",
    "packages/compiler/src/emit-client.ts:606-619",
    // 20260907-compiler-native-component-specialization
    "packages/compiler/src/emit-client.ts:57-67",
    "packages/compiler/src/emit-client.ts:723-735",
    "packages/compiler/src/emit-client.ts:770-775",
    "packages/compiler/src/oxc.ts:575-581",
    // 20260907-compiler-specialized-dom-props
    "packages/reactive-dom/src/bind-element-property.ts",
    "packages/compiler/src/emit-client.ts:330-337",
    "packages/compiler/src/emit-client.ts:830-835",
    // 20260907-compiler-select-binding
    "packages/reactive-dom/src/bind-select-value.ts",
    // 20260907-compiler-branch-specialization
    "packages/reactive-dom/src/insert-branch.ts",
    // 20260907-compiler-native-component-specialization follow-up
    "packages/compiler/src/component-prop-text.ts",
    "packages/compiler/src/oxc-component-props.ts:119-127",
    "packages/compiler/src/oxc-child-analysis.ts:228-229",
    "packages/compiler/src/oxc.ts:583-586",
    // 20260907-compiler-intermediate-computed-fusion
    "packages/compiler/src/oxc-render-values.ts:232-246",
    // 20260907-server-stream-select-option-calling-convention
    "packages/compiler/src/emit-server-stream.ts:1253-1256",
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
    "packages/compiler/test/specialized-dom-props.test.ts",
    "packages/reactive-dom/test/bind-element-property.test.ts",
    "packages/reactive-dom/test/dom-prop-application.test.ts",
    "packages/reactive-dom/test/bind-prop.test.ts",
    "packages/compiler/test/native-component-calls.test.ts",
    "packages/compiler/test/runtime-smoke.test.ts",
    "packages/compiler/test/component-prop-text.test.ts",
    "packages/compiler/test/intermediate-computed.test.ts",
    "packages/compiler/test/oxc-internals.test.ts",
    "packages/compiler/test/server-emit-shared.test.ts",
    "packages/compiler/test/server-stream-transform.test.ts",
  ],
});
