import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "forms",
  breakThreshold: 80,
  mutate: [
    "packages/forms/src/index.ts:254-258",
    "packages/forms/src/index.ts:476-536",
    "packages/forms/src/index.ts:796-844",
  ],
  testFiles: ["packages/forms/test/**/*.test.ts"],
});
