# @modular-react/store

`@modular-react/store` は mreact の global / shared state package です。
`@modular-react/reactive-core` の `cell` を土台に、selector、action、persistence を
小さく組み合わせられるようにしています。

## 基本

```ts
import { createStore, shallowEqual } from "@modular-react/store";

const counter = createStore({ count: 0, label: "counter" });

const count = counter.select((state) => state.count);
const snapshot = counter.select((state) => ({ label: state.label }), shallowEqual);

counter.set((state) => ({ count: state.count + 1 }));
```

## 主な API

- `createStore()` は state と actions を持つ store を作ります。
- `store.select()` は store state の一部だけを reactive に購読します。
- `store.subscribe()` は framework 外から変更通知を受け取ります。
- `store.transaction()` は複数更新を 1 回の通知にまとめます。
- `createRequestStoreFactory()` は request ごとに独立した store を作る factory です。
- `persist` option は storage adapter へ state を保存する hook です。

## 位置づけ

server state は `@modular-react/query`、form state は `@modular-react/forms`、
アプリ全体の UI / domain state は `@modular-react/store` に寄せるのが基本方針です。
