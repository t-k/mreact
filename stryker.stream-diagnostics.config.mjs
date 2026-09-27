import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "stream-diagnostics",
  breakThreshold: 80,
  mutate: [
    "packages/server/src/stream.ts:348-388",
  ],
  testFiles: [
    "packages/server/test/stream.test.ts",
  ],
});
