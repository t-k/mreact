import { createStrykerConfig } from "./stryker.base.config.mjs";

// The shared route hydration runtime split. Three regions are in scope:
//
// 1. route-hydration-runtime.ts lines 1-105: the specifier/namespace resolution and the two
//    emission shapes. Lines 106 onwards are the helper bodies themselves, one Record of template
//    literals moved verbatim out of client.ts; mutating a 6 KB string literal only proves that an
//    empty hydration runtime breaks every route, which the behavioural tests already cover.
// 2. client.ts:3494-3549: which runtime groups a route emits and whether it imports or inlines
//    them, including the boundary-only route that must carry no resume walk.
// 3. client.ts:2876 and client.ts:5470-5483: the batch build opt-in and the bundler hooks that
//    serve the virtual modules.
//
// The generic core, compiler, lifecycle and size profiles mutate none of these lines.
export default createStrykerConfig({
  name: "route-hydration-runtime",
  mutate: [
    "packages/router/src/route-hydration-runtime.ts:1-105",
    "packages/router/src/client.ts:2876",
    "packages/router/src/client.ts:3494-3549",
    "packages/router/src/client.ts:5470-5483",
  ],
  testFiles: ["packages/router/test/route-shared-hydration-runtime.test.ts"],
});
