import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "router-history-dom",
  breakThreshold: 80,
  mutate: [
    "benchmarks/router/browser-probes.ts:381-384",
  ],
  testFiles: ["benchmarks/router/browser-probes.test.ts"],
});
