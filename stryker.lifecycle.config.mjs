import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "lifecycle",
  breakThreshold: 80,
  mutate: [
    "packages/reactive-core/src/cleanup-scope.ts:36-61",
    "packages/reactive-core/src/computed.ts:236-239",
    "packages/reactive-core/src/computed.ts:244-251",
    "packages/reactive-core/src/computed.ts:272-277",
    "packages/reactive-core/src/scheduler.ts:78-84",
    "packages/reactive-core/src/scheduler.ts:137-152",
    "packages/reactive-core/src/tracking.ts:338-346",
    "packages/server/src/stream.ts:257-261",
  ],
  testFiles: [
    "packages/reactive-core/test/**/*.test.ts",
    "packages/server/test/stream.test.ts",
  ],
});
