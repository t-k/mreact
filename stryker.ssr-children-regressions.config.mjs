import { createStrykerConfig } from "./stryker.base.config.mjs";

// Bounded profile for nested SSR JSX capabilities and stream execution.
export default createStrykerConfig({
  name: "ssr-children-regressions",
  breakThreshold: 80,
  mutate: [
    "packages/compiler/src/oxc-child-analysis.ts:695-697",
    "packages/compiler/src/oxc-nested-lowering.ts:213-215",
    "packages/compiler/src/oxc-runtime-emit.ts:73-73",
    "packages/compiler/src/oxc-runtime-emit.ts:112-112",
    "packages/compiler/src/oxc-runtime-emit.ts:157-161",
    "packages/compiler/src/oxc-runtime-emit.ts:170-170",
    "packages/compiler/src/emit-server-stream.ts:4418-4427",
  ],
  testFiles: [
    "packages/compiler/test/generic-ssr-children.test.ts",
    "packages/compiler/test/server-emit-shared.test.ts",
    "packages/shared/test/server-render-value-internal.test.ts",
  ],
});
