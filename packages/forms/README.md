# @modular-react/forms

`@modular-react/forms` は mreact の form state / validation package です。
field ごとの値、dirty/touched、client validation、server errors をまとめて扱います。

## 基本

```ts
import { createForm } from "@modular-react/forms";

const form = createForm({
  initialValues: { email: "" },
  validate(values) {
    return values.email.includes("@") ? {} : { email: "Invalid email" };
  },
});

await form.field("email").setValue("ada@example.test");
await form.validate();
```

## 主な API

- `createForm()` は reactive な form state を作ります。
- `setServerErrors()` は route handler / server action から返った errors を反映します。
- `form.reset()` は initial values に戻します。
- `standard-schema` subpath は zod / valibot など Standard Schema 互換 validator と接続します。

## server action / route handler との連携

client 側では即時 validation、server 側では権限や DB 制約を含む validation を行い、
server errors を `setServerErrors()` で form に戻す構成を推奨します。
