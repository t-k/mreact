import { createStrykerConfig } from "./stryker.base.config.mjs";

// Regression profile for body-derived values, setup isolation, and dynamic tags.
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
    "packages/compiler/src/emit-client.ts:1995-1999",
    "packages/compiler/src/oxc.ts:1927-1931",
    "packages/compiler/src/oxc.ts:1986-1986",
  ],
  testFiles: ["packages/compiler/test/**/*.test.ts"],
});
