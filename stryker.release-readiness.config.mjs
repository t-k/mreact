import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "release-readiness",
  breakThreshold: 80,
  mutate: [
    "packages/server/src/stream.ts:143-155",
    "packages/server/src/stream.ts:184-192",
    "packages/server/src/stream.ts:391-397",
    "packages/server/src/sink.ts:72-81",
    "packages/query/src/query-lifecycle.ts:1072-1100",
  ],
  testFiles: [
    "packages/server/test/stream.test.ts",
    "packages/server/test/stream-deferred-rejection.test.ts",
    "packages/server/test/task-observation.test.ts",
    "packages/query/test/query-lifecycle.test.ts",
  ],
});
