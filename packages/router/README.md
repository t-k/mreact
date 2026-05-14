# @modular-react/router

`@modular-react/router` は mreact の app router です。file-system routes、
loader、metadata、server actions、prerender、deployment adapters をまとめて扱います。

## 基本

```ts
import { buildApp, renderBuiltAppRequest } from "@modular-react/router";

await buildApp({ appDir: "app", outDir: ".mreact" });

const response = await renderBuiltAppRequest({
  outDir: ".mreact",
  request: new Request("https://example.test/"),
});
```

## ルートで使う主な export

- `loader(context)` は page component に渡す data を返します。
- `metadata` は `<title>`、OpenGraph、viewport などを head に反映します。
- `generateStaticParams()` は dynamic route の prerender 対象を返します。
- `prerender = true` は build 時に HTML を生成します。
- `"use server"` module と `<form action={...}>` で server actions を扱います。

## Deployment adapters

- `@modular-react/router/adapters/node`: Node `http` server 向け。
- `@modular-react/router/adapters/static`: prerendered routes の静的 export 向け。
- `@modular-react/router/adapters/edge`: 汎用 `Request` / `Response` runtime 向け。
- `@modular-react/router/adapters/cloudflare`: Cloudflare Workers 向け。

Cloudflare Workers では `createCloudflareBuiltRequestHandler`、
`createCloudflareStaticAssetLoader`、`createCloudflarePrerenderStore` を組み合わせます。
client assets は generated manifest に載ったファイルだけを allow-list して配信します。

## 関連 API

- `renderAppRequest`: source app directory を直接 render する開発・テスト向け API。
- `renderBuiltAppRequest`: `.mreact/` build artifact を render する production API。
- `startDevServer`: app directory を watch する dev server。
- `startServer`: `.mreact/` build artifact を Node server として起動する helper。
