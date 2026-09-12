import { createStrykerConfig } from "./stryker.base.config.mjs";

// Bounded profile for nested SSR JSX capabilities and stream execution.
const config = createStrykerConfig({
  name: "ssr-children-regressions",
  breakThreshold: 80,
  mutate: [
    "packages/compiler/src/oxc-child-analysis.ts:645-650",
    "packages/compiler/src/oxc-child-analysis.ts:700-703",
    "packages/compiler/src/oxc-component-detection.ts:873-884",
    "packages/compiler/src/oxc-component-detection.ts:898-903",
    "packages/compiler/src/oxc-component-detection.ts:904-915",
    "packages/compiler/src/oxc-component-detection.ts:921-925",
    "packages/compiler/src/oxc-nested-lowering.ts:197-198",
    "packages/compiler/src/oxc-nested-lowering.ts:276-284",
    "packages/compiler/src/oxc-nested-lowering.ts:291-295",
    "packages/compiler/src/oxc-nested-lowering.ts:361-363",
    "packages/compiler/src/oxc-nested-lowering.ts:372-372",
    "packages/compiler/src/oxc-nested-lowering.ts:396-403",
    "packages/compiler/src/oxc-nested-lowering.ts:409-415",
    "packages/compiler/src/oxc-nested-lowering.ts:431-435",
    "packages/compiler/src/oxc-nested-lowering.ts:463-465",
    "packages/compiler/src/oxc-nested-lowering.ts:478-480",
    "packages/compiler/src/oxc-nested-lowering.ts:806-809",
    "packages/compiler/src/emit-server.ts:2560-2560",
    "packages/compiler/src/oxc-runtime-emit.ts:75-78",
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
