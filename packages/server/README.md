# @reckona/mreact-server

`@reckona/mreact-server` contains server rendering primitives used by the mreact
compiler and router. It provides HTML sinks, streaming helpers, async
boundaries, hydration scripts, event hydration manifests, Flight serialization,
and response helpers.

## Basic Usage

```ts
import { html, renderToString } from "@reckona/mreact-server";

const markup = await renderToString((sink) => {
  sink.write("<main>Hello</main>");
});

const response = html(markup);
```

## Core APIs

- `createStringSink()` writes HTML into a string sink.
- `renderToString()` renders through an HTML sink.
- `renderToReadableStream()` renders to a `ReadableStream`.
- `renderAsyncBoundary()` and `renderOutOfOrderBoundary()` support async SSR.
- `renderHydrationBoundary()` and `renderEventHydrationManifest()` emit client
  hydration data.
- `html()` wraps rendered HTML in a `Response`.

### Streaming diagnostics

`renderToReadableStream(render, { logAbortedDeferredErrors: true })` can log
deferred task errors that arrive after the stream has already been aborted. The
log is development-only, opt-in, and never writes the ignored error into the
HTTP response body.

## Subpaths

- `@reckona/mreact-server/reorder` applies out-of-order SSR fragments in the
  browser.
- `@reckona/mreact-server/flight` exposes Flight and server action primitives.
- `@reckona/mreact-server/buffer-sink` exposes buffered streaming helpers.

## Notes

Most applications use this package through `@reckona/mreact-router`.
