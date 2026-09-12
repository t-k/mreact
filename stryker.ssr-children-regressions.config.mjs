import { createStrykerConfig } from "./stryker.base.config.mjs";

// Bounded profile for nested SSR JSX capabilities and stream execution.
export default createStrykerConfig({
  name: "ssr-children-regressions",
  breakThreshold: 80,
  mutate: [
    "packages/compiler/src/oxc-child-analysis.ts:695-697",
    "packages/compiler/src/oxc-nested-lowering.ts:202-204",
    "packages/compiler/src/oxc-runtime-emit.ts:108-108",
    "packages/compiler/src/oxc-runtime-emit.ts:153-157",
    "packages/compiler/src/emit-server-stream.ts:4417-4424",
  ],
  testFiles: [
    "packages/compiler/test/generic-ssr-children.test.ts",
    "packages/compiler/test/server-emit-shared.test.ts",
    "packages/shared/test/server-render-value-internal.test.ts",
  ],
});
