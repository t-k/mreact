# Performance review: correctness, reconciliation, and delivery

This review was implemented against `ebdd53ff1c16cdd20a72ddcc6376095c370c743f`, rather than the older `312d44f` reviewed in the original report. Measurements below were collected on October 6, 2026 with Node 24.14.0 on macOS arm64 and Chromium 148.0.7778.96. Before and after runs used the same production fixtures and public API settings. Accepted comparisons ran sequentially in ABBA order without concurrent builds, tests, or mutation testing. Failed or overlapping exploratory runs were retained separately and excluded from the accepted results.

## Correctness and invariants

Compiler-generated keyed rows now keep either one static property-text binding or a packed collection, never both. Regression tests cover zero through eight properties, same-key object replacement, promotion from plain properties to tracked getters, and subscription disposal. The compiler-to-Chromium regression covers three through eight plain properties; every case failed on the baseline and passes after the fix.

Normal navigation, history traversal, deferred runtime imports, and View Transition callbacks now share an operation owner. Only the current owner can apply DOM, commit history, clear pending state, or initiate a document fallback. A superseded operation returns a distinct truthy result instead of the `false` that requests fallback. Tests also cover synchronous navigation-state event reentry and custom-element callbacks. Shared prefetch requests remain available to their other consumers.

Deletion registration preserves insertion order and deduplicates Fibers with bounded small-array checks followed by a Set. Membership information belongs to the deletion array through a WeakMap, so an obsolete array does not leave an auxiliary strong reference on its parent Fiber. Ref collection uses one accumulator and skips known ref-free subtrees; trees without a valid summary retain the conservative traversal. Public Root tests cover Suspense fallback, resolution, and unmount with both callback-ref removal and cleanup-return refs.

Public assets retain their existing precedence over routes. New builds emit an explicit asset manifest, including an empty list, and materialized Node runtimes reject absent paths without filesystem I/O. Older manifests discover the directory once, with regression coverage for symlinks, dangling symlinks, encoded filenames, invalid URLs, and path containment. Instrumentation-disabled requests return before constructing trace and URL event data.

## Measured changes

| Workload | Before median | After median | Scope |
| --- | ---: | ---: | --- |
| Register/reconcile deletion of 10,000 children | 5.0ms | 1.8ms | Actual Fiber reconciliation in Chromium |
| Register/reconcile deletion of 50,000 children | 95.3ms | 10.8ms | Actual Fiber reconciliation in Chromium |
| Replace 50,000 keyed children | 105.0ms | 16.1ms | Actual Fiber reconciliation in Chromium |
| One deletion among 50,000 nodes with refs | 26.8ms | 24.8ms | Actual host commit, not total render time |
| Add 1,000 distinct URLs to a full 10,000-entry cache | 26.414ms | 0.366ms | Actual memory cache; p95 26.856→0.395ms |
| 100 repeated dynamic-route requests | 7.709ms | 6.310ms | Actual materialized Node runtime |
| 100 warm public-asset requests | 3.7229ms | 3.7236ms | Actual materialized Node runtime |

The dynamic-route comparisons counted actual `readFile` calls: 3,000 measured requests made 3,000 unnecessary calls before the fix and zero after it. Distinct dynamic URLs showed the same removal. Runtime creation still reads its three manifests; two cold observations per variant are insufficient to claim a cold-start speedup. The first dynamic request dropped from two file reads to one, with approximately 4ms observed latency in both variants.

The existing Lambda-route-latency fixture was also run in four sequential ABBA blocks without changing its simulated waits or preload policy. These invoke the actual buffered/streaming adapters in Node, rather than measuring a deployed AWS environment. Each cold scenario has eight samples per variant, and warm redirect/shared-package rehit scenarios have 24. The fixture's health endpoint is an SSR page and therefore intentionally renders; it is not a route-handler-only health probe.

| Lambda adapter scenario | Before median / p95 | After median / p95 |
| --- | ---: | ---: |
| Cold SSR health page | 13.076 / 21.201ms | 13.291 / 14.266ms |
| Streaming health page | 1.825 / 2.761ms | 1.621 / 2.089ms |
| First loader redirect | 28.522 / 34.664ms | 28.461 / 28.920ms |
| Warm loader redirect | 27.812 / 31.831ms | 27.713 / 27.869ms |
| First shared-package route | 10.903 / 16.768ms | 9.658 / 12.611ms |
| Shared-package route rehit | 0.575 / 1.574ms | 0.485 / 0.728ms |

All status codes and payload sizes remain equivalent. The redirect scenarios record zero render-artifact load time in both versions. The cold health median increased by 0.216ms while its p95 decreased; eight cold samples do not establish an exact zero change or a production AWS latency guarantee. No additional route preload or render-artifact loading was introduced.

Public React-compatible Root measurements also covered creation, complete keyed replacement, full deletion, and a single deletion with surrounding trees of 1,000, 10,000, and 50,000 nodes. At 50,000 nodes, create/replace/delete medians were 34.9/51.7/1.9ms before and 31.9/51.3/1.8ms after. A single deletion's reconciliation remained 17.1ms in both variants. The reconciliation improvement must not be interpreted as an equivalent improvement to DOM teardown or total frame time.

Sampled commit allocations at 50,000 nodes fell from 9,048,216 to 7,525,888 bytes with sparse refs and from 22,479,752 to 19,241,844 bytes with refs throughout. These are CDP sampling estimates, not exact memory totals. The retained-Fiber traversal remains proportional to surrounding tree size.

## Client parsing and delivery

An uncached navigation now lends its parsed template to one applying consumer after authentication-context validation. The transient fragment is consumed once; persistent caches retain HTML strings. The final sequential ABBA comparison used five warmups and 30 samples per size in each of two blocks per variant, for 60 measured navigations. Chromium counted 120 template parses on the baseline and 60 on the final implementation at each size.

| Uncached generated-runtime navigation | Before median / p95 | After median / p95 |
| --- | ---: | ---: |
| 100 rows | 0.70 / 1.00ms | 0.70 / 1.00ms |
| 5,000 rows | 22.25 / 26.90ms | 20.80 / 23.80ms |
| 20,000 rows | 97.25 / 122.80ms | 83.95 / 92.90ms |

These are actual generated production navigation runtimes in Chromium, using uncached no-store Responses without HTTP transport; total user-facing network latency is outside this measurement. CDP allocation sampling and post-GC retained heap are estimates. V8 sampling excludes native DOM allocations; the final 20,000-row JS sample increased from 389,909,904 to 404,626,176 bytes (approximately 3.8%), so reduced parsing is not reported as proof of lower total allocation. The standalone navigation runtime is 8,795 gzip bytes on the baseline and 9,140 on the final implementation.

Batch builds share the deferred navigation bridge as a virtual-module factory. Each route still owns its bridge's import Promise and event callbacks, while the generated implementation is delivered once across route visits. Single-bundle and development entries inline the same implementation. The full navigation runtime retains its dynamic import and existing idle/gesture loading behavior. Production dependency-graph tests prove that importing the bridge does not eagerly import the full navigation entry and that a native route does not pull a sibling route's React-compatible root.

The unchanged six-visit fixture measured 29,073 gzip bytes after sharing, compared with 32,842 bytes immediately before sharing and 31,463 bytes on the freshly rebuilt baseline. Its initial closure is 21,949 bytes. Both dependency-graph accounting and real-browser request tracking agree. All seven existing client-delivery fixture budgets pass without raising limits or changing fixtures.

| Browser delivery phase | Before gzip bytes | After gzip bytes |
| --- | ---: | ---: |
| Native counter, hydrated before idle | 8,886 | 9,179 |
| Native counter, after idle navigation loading | 16,467 | 17,059 |
| Native counter with navigation disabled | 6,396 | 6,396 |
| React-compatible interactive fixture | 41,122 | 41,147 |
| Multi-route fixture, hydrated before idle | 13,678 | 14,069 |
| Multi-route fixture, after idle navigation loading | 21,259 | 21,949 |
| Multi-route fixture, six-visit cumulative | 31,463 | 29,073 |

Ownership guards and cache limits have a small initial-delivery cost. At the first interaction, no additional JavaScript is fetched in these fixtures. The multi-route session's later visits fetch approximately 1,780 gzip bytes per route instead of 2,550 bytes, and returning to the first route fetches no new JavaScript.

The delivery harness records hydration, first interaction, idle loading, the first navigation, and subsequent route visits in a real browser. Gzip estimates are recorded separately from Resource Timing transfer sizes. Playwright click timings are diagnostic and include actionability overhead. Sixty cold-navigation samples per variant invoke the public generated navigation entry in fresh browser contexts, with idle loading held only to measure the first-import case: the native counter's first navigation measured median 5.05→4.50ms and p95 6.40→4.90ms on loopback. This verifies the unchanged loading policy in the measured environment, rather than predicting latency on a user's network.

## Cache policy and deferred proposals

Memory-route capacity eviction retains insertion/update order rather than changing to LRU. Expiration sweeps follow the configured interval; capacity overflow evicts the oldest entry directly. As documented on the API, an expired newer entry may remain until its read or the next sweep while a valid older entry is evicted. Mutable expiry fields and expiration-getter reentry remain supported. A heap-based expiry index was rejected because externally mutable entries would invalidate its assumptions.

Public-asset retention is bounded to 32MiB total, 2MiB per entry, and 1,024 entries. Navigation HTML retention is bounded to 8MiB total, 1MiB per entry, 64 entries, and the existing lifetime. HTML accounting conservatively uses two bytes per UTF-16 code unit; it is an accounting budget, not a measured engine heap size. Byte totals are maintained incrementally. Oversized responses are still served or navigated, but are not retained, so repeated oversized assets can require repeated I/O.

The native same-order temporary-array removal was not adopted. A for-of candidate reduced allocations but slowed all-new equal-valued row objects by 8.2%; an explicit iterator variant still slowed them by 3.8%. The accepted patch only avoids constructing a key array and Set before immediately rejecting a non-disjoint replacement. Its high-resolution 10,000-row medians were 0.435→0.450ms for the same objects and 1.755→1.780ms for equal-valued new objects, with p95 2.112→2.196ms for the latter. This small difference is disclosed rather than claimed to establish exactly zero regression. The row-update loops and swap buffer remain unchanged.

Eliminating all commit-wide retained-Fiber traversal was also deferred: existing deletion/dirty flags are not a sufficient proof of reachability and alternate ownership through Suspense and bailouts. The measured ref pruning and allocation reductions are retained without weakening detach correctness. Likewise, staged client streaming needs explicit framing plus authentication, redirect, cancellation, and partial-error semantics. A synthetic stream with an immediate shell and a 500ms tail confirms that navigation still displays the shell after full response completion. Server first-chunk latency and client-visible shell latency are reported as different measurements; arbitrary HTML chunks are not parsed independently.

## Reproducing the measurements

Build both the baseline checkout and this branch with `pnpm build`, and use a separate output directory for every run. The client and delivery harnesses accept `MREACT_REVIEW_BASELINE` pointing to the built baseline checkout and `MREACT_REVIEW_OUTPUT` pointing to a fresh result directory. Run `pnpm exec tsx benchmarks/router/review-client.mts` or `pnpm exec tsx benchmarks/router/review-delivery.mts`. The server harness accepts checkout and output paths as arguments: `node benchmarks/router/review-server.mjs /path/to/built/checkout /path/to/new-result.json`. Browser and server lifetimes are closed in `finally` blocks.

The native harness is `benchmarks/primitive-browser/review-native.ts`, and the React-compatible harnesses are in `benchmarks/compat-micro/review-*`. Their inputs use the normal compiler and runtime paths. No benchmark-only navigation opt-out, render shortcut, reduced update semantics, or changed competitive fixture was introduced.

Validation includes 7,081 passing unit tests (three expected failures and six skipped cases), focused compiler and generated-runtime tests, 52 passing Chromium integration cases, build, package-test type checking, lint, both distribution and browser-delivery size budgets, `pnpm api:report:check` for 71 entry points, and separately generated/staged references followed by `pnpm docs:api:check`. Targeted Stryker configurations retain the repository's 90% threshold: native 95.65%, React compatibility 97.87%, server 95.52%, navigation 93.10%, and deferred navigation 95.18%. Mutation reports retain survivors and timeout classifications; passing a score is not a claim that every possible defect or long-term leak has been excluded.

The subsequent full Chromium suite ran 107 cases: 103 passed, three failed, and one analytics case was not run because an earlier test failed in its serial group. Running that analytics case separately passed, bringing the distinct passing cases to 104. All three failures reproduced on the unchanged baseline: the Valibot form fails during select hydration, the selective-hydration example does not replay its first increment, and the SSR streaming example cannot resolve `@reckona/mreact-compat`. This comparison found no new failing cases, but the full suite is not green.

The standalone compatibility labs also ran in Chromium: Recharts 15/15, Radix 37/37, React Flow 25/25, and UI Primitives 10/10 passed their existing interaction and DOM-summary assertions. Screenshot differences are not a pass gate in these runners. Radix dialog screenshots show missing visible content and overlay, with approximately 83% differing pixels; the dialog discrepancy reproduced with exactly the same ratio on the unchanged baseline. React Flow's largest difference was approximately 0.085%, while Recharts and UI Primitives had zero differing pixels. These 87 passing interaction cases do not establish visual equivalence or verify SSR, hydration, and bundle scopes, which the lab's Compat Doctor still marks as unverified.
