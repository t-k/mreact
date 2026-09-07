import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "reactive-core",
  breakThreshold: 80,
  mutate: [
    "packages/reactive-core/src/effect.ts:21-25",
    "packages/reactive-core/src/effect.ts:70-95",
    "packages/reactive-core/src/effect.ts:155-176",
    "packages/reactive-core/src/cleanup-scope.ts:102-105",
    "packages/reactive-core/src/cleanup-scope.ts:119-133",
  ],
  testFiles: [
    "packages/reactive-core/test/effect.test.ts",
    "packages/reactive-core/test/effect-manual-dispose.test.ts",
    "packages/reactive-core/test/cleanup-scope.test.ts",
    "packages/reactive-core/test/error.test.ts",
    "packages/reactive-core/test/coverage-fill.test.ts",
    "packages/reactive-core/test/more-edges.test.ts",
  ],
});
