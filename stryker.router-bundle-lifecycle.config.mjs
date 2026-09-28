import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "router-bundle-lifecycle",
  breakThreshold: 100,
  mutate: [
    "benchmarks/router/adapters/mreact-app-router.ts:1328-1330",
    "benchmarks/router/adapters/mreact-app-router.ts:1390-1392",
  ],
  testFiles: ["benchmarks/router/adapters/mreact-app-router-bundle-lifecycle.test.ts"],
});
