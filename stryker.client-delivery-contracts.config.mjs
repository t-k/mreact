import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "client-delivery-contracts",
  breakThreshold: 80,
  mutate: [
    "packages/router/src/boundaries.ts:373-418",
    "packages/router/src/build.ts:1109-1113",
  ],
  testFiles: [
    "packages/router/test/boundaries.test.ts",
    "packages/router/test/build.test.ts",
  ],
});
