import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "search-state",
  breakThreshold: 80,
  mutate: ["packages/router/src/search-state.ts"],
  testFiles: ["packages/router/test/search-state.test.ts"],
});
