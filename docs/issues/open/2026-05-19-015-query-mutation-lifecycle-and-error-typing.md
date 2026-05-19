# Query and mutation APIs lack lifecycle hooks and typed error reasons

## Summary

`@reckona/mreact-query` exposes a compact query and mutation API, but application
code has limited structured information for error handling and mutation side
effects. Mutation invalidation exists, but lifecycle hooks such as `onSuccess`,
`onError`, and `onSettled` are missing.

## Evidence

- `packages/query/src/index.ts` defines `QueryResult.error` and
  `MutationResult.error` as `unknown`.
- `packages/query/src/index.ts` exposes `QueryFunctionContext.signal`, but the
  result does not distinguish aborts, retries exhausted, network failures, or
  application errors.
- `packages/query/src/index.ts` defines `CreateMutationOptions` with only
  `invalidate` and `mutationFn`.
- `createMutation()` updates pending/success/error state and invalidates queries,
  but has no lifecycle callback hooks.

## Impact

Apps need side effects after successful mutations, centralized toast/error UI,
optimistic state updates, and different UX for aborts versus real failures.
Today those concerns must be implemented outside the query runtime, causing
boilerplate and inconsistent error handling.

## Suggested fix

Add structured lifecycle hooks and an optional error reason:

```ts
type QueryErrorReason = "aborted" | "retry-exhausted" | "network" | "unknown";

interface QueryResult<TData> {
  data: TData | undefined;
  error: unknown;
  errorReason?: QueryErrorReason;
  isFetching: boolean;
  status: QueryStatus;
  updatedAt: number;
}

interface CreateMutationOptions<TVariables, TData> {
  invalidate?: readonly QueryKey[];
  mutationFn: (variables: TVariables) => Promise<TData> | TData;
  onMutate?(variables: TVariables): void | Promise<void>;
  onSuccess?(data: TData, variables: TVariables): void | Promise<void>;
  onError?(error: unknown, variables: TVariables): void | Promise<void>;
  onSettled?(
    result: { data: TData; error?: undefined } | { data?: undefined; error: unknown },
    variables: TVariables,
  ): void | Promise<void>;
}
```

The hooks should run in a documented order relative to `invalidate` so apps can
rely on predictable cache behavior.

## Priority

Medium.
