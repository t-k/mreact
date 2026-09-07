import { createStrykerConfig } from "./stryker.base.config.mjs";

// The shared route hydration runtime split. Three regions are in scope:
//
// 1. route-hydration-runtime.ts lines 1-105: the specifier/namespace resolution and the two
//    emission shapes. Lines 106 onwards are the helper bodies themselves, one Record of template
//    literals moved verbatim out of client.ts; mutating a 6 KB string literal only proves that an
//    empty hydration runtime breaks every route, which the behavioural tests already cover.
// 2. client.ts:3494-3543: which runtime groups a route emits and whether it imports or inlines
//    them, including the boundary-only route that must carry no resume walk.
// 3. client.ts:2876 and client.ts:5464-5477: the batch build opt-in and the bundler hooks that
//    serve the virtual modules.
//
// Four mutants in region 3 are equivalent and cannot be killed. The onLoad filter only ever sees
// the four module names, because onResolve puts them in the namespace and nothing else writes to
// it, so anchoring that regex changes nothing, and both `runtimeModule === undefined` guards exist
// for the type rather than for a reachable state. The threshold admits exactly those four.
export default createStrykerConfig({
  name: "route-hydration-runtime",
  breakThreshold: 96,
  mutate: [
    "packages/router/src/route-hydration-runtime.ts:1-105",
    "packages/router/src/client.ts:2876-2876",
    "packages/router/src/client.ts:3494-3543",
    "packages/router/src/client.ts:5464-5477",
  ],
  testFiles: ["packages/router/test/route-shared-hydration-runtime.test.ts"],
});
