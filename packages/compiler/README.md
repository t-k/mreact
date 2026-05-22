# @reckona/mreact-compiler

`@reckona/mreact-compiler` contains the compiler passes used by mreact. It
analyzes JSX modules, produces client and server output, and reports diagnostics
for code that cannot be compiled safely.

## Usage

```ts
import { transform } from "@reckona/mreact-compiler";

const result = transform({
  filename: "app/page.tsx",
  source: `export default function Page() { return <main>Hello</main>; }`,
  target: "server",
});
```

## Exports

- `transform()` is the public compiler entrypoint.
- `@reckona/mreact-compiler/internal` exposes lower-level IR analysis helpers
  used by the router and tests.
- `@reckona/mreact-compiler/oxc` exposes the Oxc-backed analyzer path.

## Notes

This package is intended for framework integration and tooling. Application
projects should normally consume it through `@reckona/mreact-router` or
`@reckona/mreact-vite`.

The server target intentionally rejects JSX spread attributes because it emits static HTML strings and cannot safely expand arbitrary runtime props without changing escaping, URL filtering, and event/ref semantics. Prefer explicit attributes in server-rendered JSX, or wrap repeated static attributes in a component that renders those attributes directly.
