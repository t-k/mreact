# @reckona/mreact-dom

`@reckona/mreact-dom` is the React DOM-compatible entrypoint for mreact. It
exports client roots, server rendering helpers, and resource hint APIs under a
React DOM-like package surface.

## Basic Usage

```ts
import { createRoot } from "@reckona/mreact-dom/client";

createRoot(document.getElementById("root")!).render(<App />);
```

Server rendering helpers are available from `@reckona/mreact-dom/server`:

```ts
import { renderToString } from "@reckona/mreact-dom/server";

const html = renderToString(<App />);
```

## Exports

- `@reckona/mreact-dom` exports resource hint helpers and shared DOM APIs.
- `@reckona/mreact-dom/client` exports `createRoot()` and `hydrateRoot()`.
- `@reckona/mreact-dom/server` exports string, readable stream, and pipeable stream rendering helpers.
- `@reckona/mreact-dom/test-utils` exports `act()` for React Testing Library compatibility.

## flushSync

`flushSync(callback)` runs the callback and synchronously commits pending mreact work before returning: compat hook state updates and reactive-core cell/computed updates, including the cell-driven DOM bindings compiled components use.

Cell updates flush in a microtask by default, which already lands before a `document.startViewTransition()` snapshot capture, so `flushSync` is not required there; reach for it when later code in the same task must observe the committed DOM, such as layout measurement right after an update.

## Notes

This package targets React DOM compatibility. App-router SSR and deployment
adapters live in `@reckona/mreact-router`.
