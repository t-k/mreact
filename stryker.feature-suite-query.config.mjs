import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "feature-suite-query",
  breakThreshold: 80,
  mutate: [
    "packages/forms/src/index.ts:860-877",
    "packages/query/src/form-mutation.ts:108-132",
    "packages/query/src/form-mutation.ts:152-175",
    "packages/query/src/form-mutation.ts:179-240",
    "packages/query/src/query-lifecycle.ts:77-104",
    "packages/query/src/query-lifecycle.ts:185-213",
    "packages/query/src/query-lifecycle.ts:577-582",
    "packages/query/src/query-lifecycle.ts:861-865",
  ],
  testFiles: ["packages/query/test/form-mutation.test.ts"],
});
