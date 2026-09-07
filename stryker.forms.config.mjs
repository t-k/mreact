import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "forms",
  breakThreshold: 80,
  mutate: [
    "packages/forms/src/index.ts:261-262",
    "packages/forms/src/index.ts:268-355",
    "packages/forms/src/index.ts:386-461",
    "packages/forms/src/index.ts:562-633",
    "packages/forms/src/index.ts:898-946",
  ],
  testFiles: ["packages/forms/test/**/*.test.ts"],
});
