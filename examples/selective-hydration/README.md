# selective-hydration

A tiny end-to-end demo of selective hydration: the page ships as
static HTML, the client bundle is not requested at first load, and
the first user click both triggers hydration *and* is replayed
against the freshly-hydrated tree.

## Run

```bash
pnpm install
pnpm dev    # http://localhost:5175
```

Open DevTools → Network *before* the first click. You will see the
client entry (`/src/client-entry.ts`) and the React-compat runtime
fetched only after a click on `+1` or `reset` lands.

## Tour

| Interaction | Demonstrates | Look at |
|---|---|---|
| Initial load | Static SSR HTML + embedded event manifest | `server.ts`, `src/App.compat.tsx` |
| First `+1` click | Selective hydration trigger + click replay | `src/client-entry.ts` |
| Subsequent clicks | React-style state updates after the bundle is live | `src/App.compat.tsx` |

The `status` line on the page reads `static SSR` before hydration and
flips to `hydrated` once `useEffect` runs, giving you a visual cue.

## Anatomy

```
server.ts                    # http + Vite SSR + manifest injection
src/
├── App.compat.tsx           # the page (compat target)
└── client-entry.ts          # streaming-hydration root with selectiveHydration
vite.config.ts               # compat plugin for .compat.tsx, reactive for the rest
```

The server calls `react-compat.renderToString(App, {})` for the HTML
body, then `createEventHydrationManifest` + `renderEventHydrationManifest`
to embed the `<script data-mreact-event-manifest>` block. The client
uses `createStreamingHydrationRoot` with `selectiveHydration`, which
reads the manifest, captures matching events, and waits to call
`hydrateRoot` until the user actually interacts.

## Related code in the framework

- `packages/react-compat/` — the compat runtime, including the
  selective-hydration root and the streaming hydration root.
- `packages/server/` — SSR + event-hydration manifest emission.

## What this example does NOT show

- File-based routing — see [`../app-router/`](../app-router).
- Raw streaming chunk output — see [`../ssr-streaming/`](../ssr-streaming).
- The reactive primitives — see
  [`../reactive-primitives/`](../reactive-primitives).
