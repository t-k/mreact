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
  syncQueryClientAcrossTabs,
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
- `createQuery()` creates a reactive query observer. It auto-fetches empty queries in browsers by default and remains observe-only during server render. Hydrated entries render immediately, then revalidate on mount unless their server `updatedAt` timestamp is still covered by `staleTime`; pass `autoFetch: false` to require loader-prefetched data only.
- `createQuery()` accepts `gcTime` to evict an idle cache entry after the last observer disposes. It is disabled by default; pass a non-negative millisecond value when short-lived browser views should release data after unmount.
- `createQuery()` can opt into browser revalidation with `refetchOnWindowFocus` and `refetchOnReconnect`. These hooks are disabled by default and refetch through the same cache entry and abort signal path as manual `refetch()`.
- `createInfiniteQuery()` stores cursor pages under one query key, exposes `pages`, `pageParams`, `hasNextPage`, and `fetchNextPage()`, and dedupes concurrent requests for the same next page.
- `createMutation()` handles mutations and invalidation.
- Mutation lifecycle hooks run in this order: `onMutate`, `mutationFn`, state update, `onSuccess`, query invalidation, then `onSettled`. On failure, state updates before `onError` and `onSettled`. The value returned by `onMutate` is passed to `onError` and `onSettled`, which supports optimistic rollback without external bookkeeping.
- `dehydrate()` and `hydrate()` move query state from server to client while preserving each successful query's `updatedAt` timestamp for `staleTime` checks.
- `getQueryClient()` returns the browser singleton query client.
- `syncQueryClientAcrossTabs()` optionally coordinates same-origin browser tabs with `BroadcastChannel` and Web Locks. Invalidations and removals are broadcast by default; successful query data is shared only when `broadcastQueryData` or `singleFlight` is explicitly enabled.

## Router Usage

Use the request-scoped query client inside `loader`, then hydrate the browser singleton returned by `getQueryClient()`. This keeps large apps centered around query keys instead of passing every server-state value through page props. Server integrations that call `runWithQueryClient()` directly must first install `AsyncLocalStorage` with `installQueryAsyncStorage()`; without a request scope storage, `runWithQueryClient()` throws instead of using module-level state.

## Infinite Queries

Use `createInfiniteQuery()` for cursor timelines and feeds that should not hand-roll request dedupe or page state in components.

```ts
const feed = createInfiniteQuery(queryClient, {
  queryKey: ["timeline"],
  initialPageParam: null as string | null,
  queryFn: ({ pageParam, signal }) =>
    fetch(`/api/timeline?cursor=${pageParam ?? ""}`, { signal }).then((res) => res.json()),
  getNextPageParam: (lastPage) => lastPage.nextCursor,
});

await feed.fetchNextPage();
feed.result.get().pages.flatMap((page) => page.items);
```

Set `refetchOnWindowFocus` or `refetchOnReconnect` when a browser observer should refresh on visibility/focus or network reconnect. Dispose observers when a component unmounts so browser listeners are removed.

## Cross-Tab Sync

Use `syncQueryClientAcrossTabs()` when multiple same-origin tabs should observe each other's invalidations or avoid duplicate focus/reconnect refetches. The function mutates the provided client and returns a disposer that restores the original methods.

```ts
const queryClient = getQueryClient();

const disposeQuerySync = syncQueryClientAcrossTabs(queryClient, {
  channel: `mreact-query:v1:user:${sessionId}`,
  singleFlight: true,
});
```

By default, the adapter broadcasts `invalidateQueries()` and `removeQueries()` calls but does not broadcast query data. Set `broadcastQueryData: true` only when the channel name is scoped to the current authenticated user, tenant, or other isolation boundary. `singleFlight: true` uses Web Locks when available and shares successful fetch results over the channel so only one tab needs to perform a same-key fetch; without `BroadcastChannel` or Web Locks support, the local query behavior remains unchanged.
