# @modular-react/test-utils

`@modular-react/test-utils` は mreact app router の統合テストを短く書くための package です。
一時 app directory、build artifact、request helper、HTML assertion をまとめます。

## 基本

```ts
import { createAppFixture, responseText } from "@modular-react/test-utils";

const fixture = await createAppFixture({
  files: {
    "page.tsx": "export default function Page() { return <main>Hello</main>; }",
  },
});

const response = await fixture.render("/");
const html = await responseText(response);
```

## 主な API

- `createAppFixture()` は一時 app と `.mreact/` build を作ります。
- `fixture.render()` は `Request` / `Response` ベースで route を叩きます。
- `fixture.write()` は fixture app に route file を追加します。
- `responseText()` は response body を文字列として返します。

## 使いどころ

router、query、auth、forms、server actions をまたぐシナリオテストで使います。
公開 library のテストなので、シナリオ名は英語で具体的に書く方針です。
