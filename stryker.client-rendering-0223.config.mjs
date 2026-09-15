import { createStrykerConfig } from "./stryker.base.config.mjs";

// Bounded mutation profile for the 2026-09-15 inferred-boundary and Link child regressions.
// The ranges cover only the new decisions and their reporting paths so unrelated legacy
// heuristics do not dilute the score.
const config = createStrykerConfig({
  name: "client-rendering-0223-focused-v22",
  breakThreshold: 100,
  mutate: [
    // The bare-handler acceptance decision, AST declaration lookup, and conservative gates.
    "packages/router/src/client.ts:2097-2102",
    "packages/router/src/client.ts:2202-2215",
    "packages/router/src/client.ts:2248-2248",
    "packages/router/src/client.ts:2253-2261",
    "packages/router/src/client.ts:2269-2277",
    "packages/router/src/client.ts:2345-2360",
    "packages/router/src/client.ts:2386-2386",
    "packages/router/src/client.ts:2397-2397",
    "packages/router/src/client.ts:2406-2406",
    "packages/router/src/client.ts:2430-2430",
    "packages/router/src/client.ts:2446-2448",
    "packages/router/src/client.ts:2492-2493",
    "packages/router/src/client.ts:2503-2504",
    "packages/router/src/client.ts:2511-2512",
    "packages/router/src/client.ts:2519-2520",
    // Structured fallback reason reporting.
    "packages/router/src/boundaries.ts:413-418",
    // The render-value dispatch callback. Marker seed text and optional diagnostics are
    // intentionally outside the range because insertRenderValue clears them synchronously.
    "packages/router/src/link.ts:321-321",
    "packages/compiler/src/emit-client.ts:1458-1458",
    "packages/compiler/src/emit-client.ts:1479-1479",
    "packages/compiler/src/emit-client.ts:1528-1528",
    "packages/compiler/src/emit-client.ts:1537-1537",
    "packages/compiler/src/emit-client.ts:1576-1576",
    "packages/compiler/src/emit-client.ts:1582-1582",
    "packages/compiler/src/emit-client.ts:2083-2083",
    "packages/compiler/src/emit-client.ts:2123-2124",
    "packages/compiler/src/emit-client.ts:2149-2150",
    "packages/compiler/src/emit-server.ts:3159-3160",
    "packages/compiler/src/emit-server-stream.ts:4313-4314",
  ],
  testFiles: [
    "packages/router/test/client-module-boundaries.test.ts",
    "packages/router/test/boundaries.test.ts",
    "packages/router/test/link-client.test.ts",
    "packages/compiler/test/runtime-smoke.test.ts",
    "packages/compiler/test/owner-scoped-memo-imports.test.ts",
    "packages/compiler/test/router-link-binding.test.ts",
  ],
});

export default {
  ...config,
  ignorePatterns: ["benchmarks/results/**"],
  incremental: false,
};
