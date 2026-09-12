import { createStrykerConfig } from "./stryker.base.config.mjs";

// Bounded profile for nested SSR JSX capabilities and stream execution.
export default createStrykerConfig({
  name: "ssr-children-regressions",
  breakThreshold: 80,
  mutate: [
    "packages/compiler/src/oxc-child-analysis.ts:695-697",
    "packages/compiler/src/oxc-nested-lowering.ts:119-120",
    "packages/compiler/src/oxc-nested-lowering.ts:129-129",
    "packages/compiler/src/oxc-nested-lowering.ts:225-225",
    "packages/compiler/src/oxc-nested-lowering.ts:228-228",
    "packages/compiler/src/oxc-runtime-emit.ts:73-73",
    "packages/compiler/src/oxc-runtime-emit.ts:114-117",
    "packages/compiler/src/oxc-runtime-emit.ts:121-121",
    "packages/compiler/src/oxc-runtime-emit.ts:128-130",
    "packages/compiler/src/oxc-runtime-emit.ts:135-138",
    "packages/compiler/src/oxc-runtime-emit.ts:141-146",
    "packages/compiler/src/oxc-runtime-emit.ts:151-157",
    "packages/compiler/src/oxc-runtime-emit.ts:161-166",
    "packages/compiler/src/oxc-runtime-emit.ts:177-177",
    "packages/compiler/src/oxc-runtime-emit.ts:181-184",
    "packages/compiler/src/oxc-runtime-emit.ts:192-194",
    "packages/compiler/src/oxc-runtime-emit.ts:201-201",
    "packages/compiler/src/oxc-runtime-emit.ts:206-208",
    "packages/compiler/src/oxc-runtime-emit.ts:219-220",
    "packages/compiler/src/oxc-runtime-emit.ts:228-229",
    "packages/compiler/src/emit-server-stream.ts:4418-4420",
    "packages/compiler/src/emit-server-stream.ts:4422-4422",
    "packages/compiler/src/emit-server-stream.ts:4424-4427",
    "packages/router/src/module-specifiers.ts",
  ],
  testFiles: [
    "packages/compiler/test/generic-ssr-children.test.ts",
    "packages/compiler/test/server-emit-shared.test.ts",
    "packages/shared/test/server-render-value-internal.test.ts",
    "packages/router/test/compat-vendor-chunks.test.ts",
  ],
});
