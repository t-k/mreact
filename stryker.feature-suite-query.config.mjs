import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "feature-suite-query",
  breakThreshold: 80,
  mutate: [
    "packages/forms/src/index.ts:860-877",
    "packages/query/src/form-mutation.ts:108-132",
    "packages/query/src/form-mutation.ts:152-175",
    "packages/query/src/form-mutation.ts:179-240",
    "packages/query/src/query-lifecycle.ts:104-104",
    "packages/query/src/query-lifecycle.ts:196-199",
    "packages/query/src/query-lifecycle.ts:213-213",
    "packages/query/src/query-lifecycle.ts:577-582",
    "packages/query/src/query-lifecycle.ts:864-864",
  ],
  testFiles: ["packages/query/test/**/*.test.ts"],
});
