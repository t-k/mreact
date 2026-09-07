import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "state",
  breakThreshold: 80,
  mutate: [
    "packages/store/src/index.ts:577-621",
    "packages/query/src/query-lifecycle.ts:341-393",
  ],
  testFiles: [
    "packages/store/test/store.test.ts",
    "packages/query/test/query-client.test.ts",
    "packages/query/test/query-inactive-limit.test.ts",
    "packages/query/test/query-lifecycle.test.ts",
    "packages/query/test/query-observer.test.ts",
  ],
});
