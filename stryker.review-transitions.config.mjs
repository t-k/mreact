import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "review-transitions",
  breakThreshold: 80,
  mutate: [
    "packages/reactive-core/src/computed.ts:393-412",
    "packages/reactive-core/src/state.ts:91-100",
    "packages/reactive-core/src/state.ts:138-147",
    "packages/compiler/src/oxc-expression-facts.ts:399-415",
    "packages/compiler/src/oxc-bindings.ts:108-122",
    "packages/compiler/src/oxc.ts:1961-1968",
  ],
  testFiles: [
    "packages/reactive-core/test/tracking-performance.test.ts",
    "packages/reactive-core/test/dormant-validation.test.ts",
    "packages/reactive-core/test/computed.test.ts",
    "packages/reactive-core/test/source-version.test.ts",
    "packages/reactive-core/test/dormant-dependency-snapshot.test.ts",
    "packages/compiler/test/oxc-expression-facts.test.ts",
    "packages/compiler/test/direct-cell-text.test.ts",
  ],
});
