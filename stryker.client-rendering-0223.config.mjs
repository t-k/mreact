import { createStrykerConfig } from "./stryker.base.config.mjs";

// Bounded mutation profile for the 2026-09-15 inferred-boundary and Link child regressions.
// The ranges cover only the new decisions and their reporting paths so unrelated legacy
// heuristics do not dilute the score.
export default createStrykerConfig({
  name: "client-rendering-0223-focused",
  breakThreshold: 100,
  mutate: [
    // The bare-handler acceptance decision and conservative uniqueness/reassignment gates.
    "packages/router/src/client.ts:2164-2170",
    "packages/router/src/client.ts:2172-2175",
    "packages/router/src/client.ts:2225-2230",
    "packages/router/src/client.ts:2232-2237",
    // Structured fallback reason reporting.
    "packages/router/src/boundaries.ts:413-418",
    // The render-value dispatch callback. Marker seed text and optional diagnostics are
    // intentionally outside the range because insertRenderValue clears them synchronously.
    "packages/router/src/link.ts:320-320",
    "packages/compiler/src/emit-client.ts:1390-1393",
  ],
  testFiles: [
    "packages/router/test/client-module-boundaries.test.ts",
    "packages/router/test/boundaries.test.ts",
    "packages/router/test/link-client.test.ts",
    "packages/compiler/test/runtime-smoke.test.ts",
  ],
});
