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

The server target supports JSX spread attributes on HTML and SVG elements. Spread attributes use the same escaping and URL filtering as normal dynamic attributes, normalize common JSX aliases such as `className`, `htmlFor`, `srcDoc`, `tabIndex`, `defaultValue`, and `defaultChecked`, and drop `key`, `ref`, `children`, event handlers, invalid attribute names, unsafe URL values such as `javascript:`, and raw `srcDoc` strings. Use `{ __html: value }` for `srcDoc` when you intentionally need iframe document HTML.
