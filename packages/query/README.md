# @modular-react/query

`@modular-react/query` は mreact の server state / async cache package です。
loader で prefetch し、client component では同じ query cache を hydrate して使えます。

## 基本

```ts
import {
  createQuery,
  createQueryClient,
  dehydrate,
  getQueryClient,
  hydrate,
} from "@modular-react/query";

const queryClient = createQueryClient();

await queryClient.prefetchQuery({
  queryKey: ["profile"],
  queryFn: () => fetch("/api/profile").then((res) => res.json()),
});

const state = dehydrate(queryClient);
hydrate(getQueryClient(), state);
```

## 主な API

- `createQueryClient()` は query cache を作ります。
- `fetchQuery()` / `prefetchQuery()` は async data を cache します。
- `createQuery()` は reactive な query observer を作ります。
- `createMutation()` は mutation と invalidation を扱います。
- `dehydrate()` / `hydrate()` は server-to-client handoff に使います。
- `getQueryClient()` は browser 側の singleton query client を返します。

## router との使い分け

`loader` では request-scoped な query client を使い、client 側では
`getQueryClient()` に hydrate して再利用します。ページごとの props 配布を減らし、
大規模アプリでも query key 中心で server state を扱えます。
