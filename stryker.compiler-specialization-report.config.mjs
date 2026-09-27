import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "compiler-specialization-report",
  breakThreshold: 80,
  mutate: [
    "packages/compiler/src/emit-client.ts:40-45",
    "packages/compiler/src/emit-client.ts:846-890",
    "packages/compiler/src/transform.ts:137-139",
  ],
  testFiles: [
    "packages/compiler/test/specialization-report.test.ts",
    "packages/compiler/test/specialization-parity.test.ts",
  ],
});
