# @reckona/mreact-query

`@reckona/mreact-query` provides server state and async cache primitives for
mreact. Loaders can prefetch data on the server, while client components hydrate
and continue using the same query cache.

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
  queryFn: () => fetch("/api/profile").then((res) => res.json()),
});

const state = dehydrate(queryClient);
hydrate(getQueryClient(), state);
```

## Core APIs

- `createQueryClient()` creates a query cache.
- `fetchQuery()` and `prefetchQuery()` execute async data functions and cache their results.
- `createQuery()` creates a reactive query observer.
- `createMutation()` handles mutations and invalidation.
- `dehydrate()` and `hydrate()` move query state from server to client.
- `getQueryClient()` returns the browser singleton query client.

## Router Usage

Use the request-scoped query client inside `loader`, then hydrate the browser
singleton returned by `getQueryClient()`. This keeps large apps centered around
query keys instead of passing every server-state value through page props.
