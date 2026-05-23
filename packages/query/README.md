# @reckona/mreact-query

`@reckona/mreact-query` provides server state and async cache primitives for mreact. Loaders can prefetch data on the server, while client components hydrate and continue using the same query cache.

## Basic Usage

```ts
import {
  createQuery,
  createQueryClient,
  dehydrate,
  getQueryClient,
  hydrate,
} from "@reckona/mreact-query";

const queryClient = createQueryClient();

await queryClient.prefetchQuery({
  queryKey: ["profile"],
  retry: 2,
  retryDelay: 100,
  queryFn: ({ signal }) => fetch("/api/profile", { signal }).then((res) => res.json()),
});

const state = dehydrate(queryClient);
hydrate(getQueryClient(), state);
```

## Core APIs

- `createQueryClient()` creates a query cache.
- `fetchQuery()` and `prefetchQuery()` execute async data functions and cache their results.
- Query functions receive `{ queryKey, signal }`; pass `signal` to `fetch()` so `cancelQueries()` can abort in-flight work.
- `retry` and `retryDelay` opt into bounded retries for transient failures.
- Query results expose `errorReason` as `"aborted"`, `"retry-exhausted"`, `"network"`, or `"unknown"` so UI can avoid treating cancellations like user-visible failures.
- `cancelQueries()` aborts in-flight queries by key prefix without retrying the canceled request.
- `removeQueries()` aborts matching in-flight queries, evicts matching cache entries, and resets subscribed observers to an empty pending result.
- `createQuery()` creates a reactive query observer. It auto-fetches empty queries in browsers by default and remains observe-only during server render; pass `autoFetch: false` to require loader-prefetched data only.
- `createMutation()` handles mutations and invalidation.
- Mutation lifecycle hooks run in this order: `onMutate`, `mutationFn`, state update, `onSuccess`, query invalidation, then `onSettled`. On failure, state updates before `onError` and `onSettled`. The value returned by `onMutate` is passed to `onError` and `onSettled`, which supports optimistic rollback without external bookkeeping.
- `dehydrate()` and `hydrate()` move query state from server to client.
- `getQueryClient()` returns the browser singleton query client.

## Router Usage

Use the request-scoped query client inside `loader`, then hydrate the browser singleton returned by `getQueryClient()`. This keeps large apps centered around query keys instead of passing every server-state value through page props.
