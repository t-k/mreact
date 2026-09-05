import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "lifecycle",
  breakThreshold: 80,
  mutate: [
    "packages/reactive-core/src/cleanup-scope.ts:36-61",
    "packages/reactive-core/src/computed.ts:218-221",
    "packages/reactive-core/src/scheduler.ts:78-84",
    "packages/reactive-core/src/scheduler.ts:137-152",
  ],
  testFiles: ["packages/reactive-core/test/**/*.test.ts"],
});
