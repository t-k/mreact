import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "subscriber-demotion",
  breakThreshold: 80,
  mutate: [
    "packages/reactive-core/src/tracking.ts:54-61",
    "packages/reactive-core/src/cell-subscription.ts:108-120",
  ],
  testFiles: [
    "packages/reactive-core/test/tracking-performance.test.ts",
    "packages/reactive-core/test/devtools.test.ts",
  ],
});
