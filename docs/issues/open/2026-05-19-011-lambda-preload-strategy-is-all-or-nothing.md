# Lambda preload strategy is all-or-nothing

## Summary

AWS Lambda users currently choose between background preload, which may race the
first route hit, and `createPreloadedAwsLambdaRequestHandler()`, which waits for
the full built runtime preload during Lambda init. There is no supported middle
ground for preloading only middleware, route shells, known hot routes, or matched
route closures.

## Evidence

- `packages/router/src/adapters/aws-lambda.ts` starts `runtimePreloadPromise`
  inside `createAwsLambdaRequestHandler()`, but only stores it as a fire-and-forget
  background task.
- The request path in the same adapter awaits `runtimeDirPromise`, then calls
  `renderBuiltAppRequest()`; it does not await `runtimePreloadPromise`.
- `createPreloadedAwsLambdaRequestHandler()` waits for `preloadBuiltAppRuntime()`
  before returning the handler.
- `packages/router/src/serve.ts` implements `preloadBuiltAppRuntime()` by loading
  all built server module artifact files and then preloading request modules for
  all routes.
- `README.md` documents that `createAwsLambdaRequestHandler()` uses background
  preload and recommends `await createPreloadedAwsLambdaRequestHandler()` when
  first-request latency matters.

## Impact

For large apps, full preload can increase Lambda `Init Duration` and memory use,
while background preload can still leave the first real route hit doing matched
route closure loading and module evaluation. Operators cannot tune this trade-off
per deployment target or per route popularity.

## Suggested fix

Expose an explicit preload strategy, for example:

```ts
createAwsLambdaRequestHandler({
  outDir,
  preload: {
    mode: "middleware-and-hot-routes",
    routes: ["/", "/login", "/dashboard"],
    awaitDuringInit: true,
  },
});
```

Possible modes:

- `none`: no background work.
- `middleware`: preload only middleware and shared runtime.
- `matched`: keep current request-time matched closure loading.
- `hot-routes`: preload a configured route set.
- `all`: current full `preloadBuiltAppRuntime()` behavior.

The timing logger should also report whether the request hit preloaded modules,
waited on an in-flight preload, or performed route-local loading itself.

## Priority

High.
