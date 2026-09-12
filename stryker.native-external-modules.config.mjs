import { createStrykerConfig } from "./stryker.base.config.mjs";

// The shared runner environment is created once per worker, so per-test
// coverage would attribute its plugin wiring to whichever test ran first.
export default {
  ...createStrykerConfig({
    name: "native-external-modules",
    breakThreshold: 100,
    mutate: [
      "packages/router/src/module-runner.ts:250-316",
      "packages/router/src/module-runner.ts:974-980",
    ],
    testFiles: [
      "packages/router/test/module-runner-native-externals.test.ts",
      "packages/router/test/server-render-values.test.ts",
    ],
  }),
  coverageAnalysis: "all",
  ignoreStatic: false,
};
