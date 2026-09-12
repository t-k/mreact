import { createStrykerConfig } from "./stryker.base.config.mjs";

// The shared runner environment is created once per worker, so per-test
// coverage would attribute its plugin wiring to whichever test ran first.
// Line ranges cover the native external classification and the CommonJS shim
// rewrite in module-runner.ts; re-check them after editing the file.
export default {
  ...createStrykerConfig({
    name: "native-external-modules",
    breakThreshold: 100,
    mutate: [
      "packages/router/src/module-runner.ts:247-318",
      "packages/router/src/module-runner.ts:933-1013",
    ],
    testFiles: [
      "packages/router/test/module-runner-native-externals.test.ts",
      "packages/router/test/server-render-values.test.ts",
    ],
  }),
  coverageAnalysis: "all",
  ignoreStatic: false,
};
