import { createStrykerConfig } from "../../stryker.base.config.mjs";

export default createStrykerConfig({
  name: "collection",
  breakThreshold: 80,
  mutate: ["packages/collection/src/index.ts"],
  testFiles: ["packages/collection/test/collection.test.ts"],
});
