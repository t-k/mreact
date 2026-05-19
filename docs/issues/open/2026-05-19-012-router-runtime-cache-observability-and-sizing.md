# Router runtime cache sizing and observability are fixed internally

## Summary

Several router hot-path caches use fixed entry limits and have no public
observability. This makes production cache thrashing hard to diagnose in large
apps, especially when route/module counts exceed the fixed caps or when import
policy variants multiply cache keys.

## Evidence

`packages/router/src/render.ts` defines fixed cache limits:

- `maxServerTransformCacheEntries = 512`
- `maxRouteSourceAnalysisCacheEntries = 512`
- `maxRouteLoaderModuleCacheEntries = 512`
- `maxMiddlewareModuleCacheEntries = 64`
- `maxServerRouteModuleCacheEntries = 512`
- `maxComposedRouteMetadataCacheEntries = 512`

The same file can still call esbuild bundling helpers for middleware, loaders,
and metadata when prebuilt artifacts are unavailable or cache entries are evicted:

- `bundleMiddlewareModuleCode()`
- `bundleRouteLoaderModuleCode()`
- `bundleRouteMetadataModuleCode()`

`packages/router/src/module-runner.ts` also keeps fixed `sourceModuleCache` and
`serverSourceTransformCache` limits.

## Impact

The defaults are reasonable for small and medium apps, but high-route-count apps
or multi-tenant deployments can start evicting hot modules. If that happens,
request latency can regress through extra transform, bundle, and import work, and
operators currently have no hit/miss counters to confirm the cause.

## Suggested fix

1. Emit optional debug events through `AppRouterLogger` for cache hits, misses,
   evictions, and route-local module load durations.
2. Add deployment configuration for cache sizing, either through adapter options
   or documented environment variables.
3. Consider separate production defaults for middleware and metadata caches,
   because middleware sits before every route and a limit of 64 is easier to
   exhaust through version/import-policy variants.
4. Add a benchmark fixture that renders more than 512 route/module variants to
   detect cache-thrashing regressions.

## Priority

Medium.
