import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "compat-props-allocations",
  breakThreshold: 100,
  mutate: ["size/compat-props-allocations.mjs"],
  testFiles: ["size/compat-props-allocations.test.ts"],
});
