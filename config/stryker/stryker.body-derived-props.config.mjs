import { createStrykerConfig } from "./stryker.base.config.mjs";

// Regression profile for body-derived values, runtime setup tracking, and dynamic tags.
export default createStrykerConfig({
  name: "body-derived-props",
  breakThreshold: 80,
  mutate: [
    "packages/compiler/src/oxc-render-values.ts:66-152",
    "packages/compiler/src/oxc-render-values.ts:240-269",
    "packages/compiler/src/oxc-render-values.ts:297-297",
    "packages/compiler/src/oxc-render-values.ts:324-324",
    "packages/compiler/src/oxc-render-values.ts:471-471",
    "packages/compiler/src/oxc-render-values.ts:1504-1522",
    "packages/compiler/src/oxc-expression-facts.ts:364-380",
    "packages/compiler/src/oxc-child-analysis.ts:220-223",
    "packages/compiler/src/oxc-child-analysis.ts:227-227",
    "packages/compiler/src/oxc-child-analysis.ts:307-314",
    "packages/compiler/src/emit-client.ts:1982-2002",
    "packages/compiler/src/oxc.ts:1927-1931",
    "packages/compiler/src/oxc.ts:1986-1986",
    "packages/compiler/src/oxc.ts:2024-2030",
    "packages/compiler/src/oxc.ts:2503-2520",
    "packages/reactive-core/src/cell.ts:103-112",
    "packages/reactive-core/src/computed.ts:118-132",
    "packages/reactive-core/src/selector.ts:38:4-38:69",
    "packages/reactive-core/src/selector.ts:70:8-70:70",
    "packages/reactive-core/src/setup-tracking.ts:8-117",
    "packages/reactive-core/src/tracking.ts:6-17",
  ],
  testFiles: ["packages/compiler/test/**/*.test.ts", "packages/reactive-core/test/**/*.test.ts"],
});
