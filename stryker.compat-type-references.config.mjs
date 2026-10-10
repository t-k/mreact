import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "compat-type-references",
  // Parser metadata does not affect the import proof.
  mutate: [
    "packages/compiler/src/compat-import-normalization.ts:1-21",
    "packages/compiler/src/compat-import-normalization.ts:31-167",
  ],
  testFiles: [
    "packages/compiler/test/compat-import-normalization.test.ts",
    "packages/router/test/compat-ssr-eligibility.test.ts",
  ],
});
