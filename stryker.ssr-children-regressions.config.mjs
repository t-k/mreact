import { createStrykerConfig } from "./stryker.base.config.mjs";

// Bounded profile for nested SSR JSX capabilities and stream execution.
const config = createStrykerConfig({
  name: "ssr-children-regressions",
  breakThreshold: 80,
  mutate: [
    "packages/compiler/src/oxc-child-analysis.ts:695-697",
    "packages/compiler/src/oxc-nested-lowering.ts:268-277",
    "packages/compiler/src/oxc-nested-lowering.ts:283-287",
    "packages/compiler/src/oxc-nested-lowering.ts:372-372",
    "packages/compiler/src/oxc-nested-lowering.ts:832-835",
    "packages/compiler/src/emit-server.ts:2560-2560",
    "packages/compiler/src/oxc-runtime-emit.ts:73-73",
    "packages/compiler/src/oxc-runtime-emit.ts:111-111",
    "packages/compiler/src/oxc-runtime-emit.ts:116-116",
    "packages/compiler/src/oxc-runtime-emit.ts:128-132",
    "packages/compiler/src/oxc-runtime-emit.ts:159-172",
    "packages/compiler/src/oxc-runtime-emit.ts:176-187",
    "packages/compiler/src/oxc-runtime-emit.ts:191-197",
    "packages/compiler/src/oxc-runtime-emit.ts:249-256",
    "packages/compiler/src/oxc-runtime-emit.ts:331-348",
    "packages/compiler/src/oxc-runtime-emit.ts:494-494",
    "packages/compiler/src/oxc-runtime-emit.ts:498-498",
    "packages/compiler/src/oxc-runtime-emit.ts:502-502",
    "packages/compiler/src/oxc-runtime-emit.ts:505-507",
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
