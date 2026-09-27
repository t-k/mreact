import { createStrykerConfig } from "../../stryker.base.config.mjs";

export default createStrykerConfig({
  name: "compiler-explorer",
  breakThreshold: 80,
  mutate: ["packages/compiler/src/compiler-explorer.ts"],
  testFiles: ["packages/compiler/test/compiler-explorer.test.ts"],
});
