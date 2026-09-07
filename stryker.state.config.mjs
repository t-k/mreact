import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "state",
  breakThreshold: 80,
  mutate: ["packages/store/src/index.ts:575-613"],
  testFiles: ["packages/store/test/store.test.ts"],
});
