import { createStrykerConfig } from "./stryker.base.config.mjs";

// Bounded profile for nested SSR JSX capabilities and stream execution.
const config = createStrykerConfig({
  name: "ssr-children-regressions",
  breakThreshold: 80,
  mutate: [
    "packages/compiler/src/oxc-child-analysis.ts:695-697",
    "packages/compiler/src/oxc-nested-lowering.ts:257-268",
    "packages/compiler/src/oxc-nested-lowering.ts:352-352",
    "packages/compiler/src/oxc-nested-lowering.ts:364-364",
    "packages/compiler/src/oxc-nested-lowering.ts:756-761",
    "packages/compiler/src/oxc-runtime-emit.ts:73-73",
    "packages/compiler/src/oxc-runtime-emit.ts:109-132",
    "packages/compiler/src/oxc-runtime-emit.ts:164-176",
    "packages/compiler/src/oxc-runtime-emit.ts:194-199",
    "packages/compiler/src/oxc-runtime-emit.ts:243-251",
    "packages/router/src/module-specifiers.ts",
  ],
  testFiles: [
    "packages/compiler/test/generic-ssr-children.test.ts",
    "packages/compiler/test/server-emit-shared.test.ts",
    "packages/shared/test/server-render-value-internal.test.ts",
    "packages/router/test/compat-vendor-chunks.test.ts",
  ],
});

export default { ...config, incremental: false };
