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

Boundary graph analysis is also available for tooling that needs to explain how route entries and imported modules cross server/client boundaries:

```ts
import { analyzeBoundaryGraph } from "@reckona/mreact-compiler";

const graph = await analyzeBoundaryGraph({
  entries: [{ file: "app/page.tsx", kind: "route-page" }],
  readModule: async (file) => sources.get(file),
  resolveModule: async ({ importer, source }) => resolveAppImport(importer, source),
});

console.log(graph.clientBoundaries, graph.serverActions, graph.trace);
```

## Exports

- `transform()` is the public compiler entrypoint.
- `analyzeBoundaryGraph()` traces module classifications, rendered client boundaries, and inferred form server action sites across app-local static imports.
- `@reckona/mreact-compiler/internal` exposes lower-level IR analysis helpers
  used by the router and tests.
- `@reckona/mreact-compiler/oxc` exposes the Oxc-backed analyzer path.

## Notes

This package is intended for framework integration and tooling. Application
projects should normally consume it through `@reckona/mreact-router` or
`@reckona/mreact-vite`.

The server target supports JSX spread attributes on HTML and SVG elements. Spread attributes use the same escaping and URL filtering as normal dynamic attributes, normalize common JSX aliases such as `className`, `htmlFor`, `srcDoc`, `tabIndex`, `defaultValue`, and `defaultChecked`, and drop `key`, `ref`, `children`, event handlers, invalid attribute names, unsafe URL values such as `javascript:`, and raw `srcDoc` strings. Use `{ __html: value }` for `srcDoc` when you intentionally need iframe document HTML. Explicit `dangerouslySetInnerHTML={{ __html: value }}` on an element emits trusted raw children on server and reactive client output, which is intended for small root-level bootstraps such as inline scripts where the application owns the full string. The value must be an exact object with one own data property named `__html` whose value is a string; invalid or null values clear the element without coercion. A direct `dangerouslySetInnerHTML` prop takes precedence over JSX children. Direct props and spreads are applied in source order during initial client setup, so the later binding wins; after setup, the most recent reactive write wins.

Qualified JSX attributes such as `xlink:href`, `xml:lang`, and `xmlns:xlink` retain their namespace on server and client output. URL-bearing qualified attributes such as `xlink:href` use the same unsafe-scheme filtering as `href`. Namespaced JSX tag names are rejected because the compiler does not create custom namespace-qualified elements.
