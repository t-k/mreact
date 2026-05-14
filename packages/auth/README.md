# @modular-react/auth

`@modular-react/auth` は mreact app router 向けの session / authorization helper です。
router の cookie/session API の上に、role / permission guard と client handoff を提供します。

## 基本

```ts
import { configureAuth, getCurrentSession, requireRole } from "@modular-react/auth";
import { sessionStore } from "./session-store";

configureAuth({
  redirectTo: "/login",
  forbiddenTo: "/forbidden",
});

export async function loader({ request }) {
  const session = await getCurrentSession(request, sessionStore);
  await requireRole(request, sessionStore, ["admin", "editor"]);
  return { user: session?.claims };
}
```

## 主な API

- `configureAuth()` は app-wide の redirect / forbidden defaults を設定します。
- `getCurrentSession()` は現在の request session を返します。
- `requireRole()` / `requirePermission()` は満たさない場合に redirect します。
- `tryRequireRole()` / `tryRequirePermission()` は boolean で判定します。
- `getSessionClaims()` は server/client 両方で session claims を読む handoff API です。

## router との連携

page module で `export const auth = "include-claims"` を指定すると、router が
session claims を HTML に埋め込みます。client component は props drilling なしで
`getSessionClaims()` を呼べます。
