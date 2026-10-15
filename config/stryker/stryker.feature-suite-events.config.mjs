import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "feature-suite-events",
  breakThreshold: 80,
  mutate: ["packages/reactive-core/src/resource-events.ts:76-119", "packages/reactive-core/src/resource-events.ts:121-193"],
  testFiles: ["packages/reactive-core/test/resource-events.test.ts"],
});
