import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "server-render-value-runner",
  breakThreshold: 100,
  mutate: ["packages/router/src/module-runner.ts:141-149"],
  testFiles: [
    "packages/router/test/server-render-values.test.ts",
    "packages/router/test/module-runner-unit.test.ts",
  ],
});
