import { createStrykerConfig } from "./stryker.base.config.mjs";

// Bounded mutation profile for the 2026-09-15 inferred-boundary and Link child regressions.
// The ranges cover only the new decisions and their reporting paths so unrelated legacy
// heuristics do not dilute the score.
export default createStrykerConfig({
  name: "client-rendering-0223-focused-v2",
  breakThreshold: 100,
  mutate: [
    // The bare-handler acceptance decision and conservative uniqueness/reassignment gates.
    "packages/router/src/client.ts:2169-2175",
    "packages/router/src/client.ts:2177-2180",
    "packages/router/src/client.ts:2195-2197",
    "packages/router/src/client.ts:2234-2235",
    "packages/router/src/client.ts:2238-2243",
    // Structured fallback reason reporting.
    "packages/router/src/boundaries.ts:413-418",
    // The render-value dispatch callback. Marker seed text and optional diagnostics are
    // intentionally outside the range because insertRenderValue clears them synchronously.
    "packages/router/src/link.ts:321-321",
    "packages/compiler/src/emit-client.ts:1390-1393",
  ],
  testFiles: [
    "packages/router/test/client-module-boundaries.test.ts",
    "packages/router/test/boundaries.test.ts",
    "packages/router/test/link-client.test.ts",
    "packages/compiler/test/runtime-smoke.test.ts",
  ],
});
