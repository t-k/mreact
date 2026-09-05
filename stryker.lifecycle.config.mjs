import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "lifecycle",
  breakThreshold: 80,
  mutate: [
    "packages/reactive-core/src/cleanup-scope.ts:36-61",
    "packages/reactive-core/src/computed.ts:218-221",
    "packages/reactive-core/src/computed.ts:185-195",
    "packages/reactive-core/src/scheduler.ts:78-84",
    "packages/reactive-core/src/scheduler.ts:137-152",
    "packages/reactive-core/src/tracking.ts:303-344",
    "packages/query/src/query-lifecycle.ts:214-261",
    "packages/server/src/stream.ts:257-295",
  ],
  testFiles: [
    "packages/reactive-core/test/**/*.test.ts",
    "packages/query/test/query-client.test.ts",
    "packages/query/test/query-cleanup-scope.test.ts",
    "packages/server/test/stream.test.ts",
  ],
});
