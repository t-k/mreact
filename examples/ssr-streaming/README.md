# ssr-streaming

Three small scripts that print mreact's SSR output to your terminal so
you can read the chunk shapes by eye. No browser involved.

## Run

```bash
pnpm install
pnpm demo:string    # single HTML string, no streaming
pnpm demo:stream    # server-stream chunks printed in order
pnpm demo:await     # server-stream with <Await> boundary timing
```

## Tour

| Command | Demonstrates | Look at |
|---|---|---|
| `pnpm demo:string` | `module.App()` against the server-string target — synchronous HTML | `scripts/string.ts`, `src/StringPage.tsx` |
| `pnpm demo:stream` | Compiled `App($sink)` against the server-stream target — chunked output | `scripts/stream.ts`, `src/StreamPage.tsx` |
| `pnpm demo:await`  | `<Await value={promise}>` with a `catch` branch for a rejected promise | `scripts/await-oob.ts`, `src/AwaitPage.tsx` |

## Anatomy

```
scripts/
├── string.ts        # server-string target
├── stream.ts        # server-stream target
└── await-oob.ts     # server-stream with <Await> boundaries
src/
├── StringPage.tsx   # server-string page
├── StreamPage.tsx   # server-stream page
└── AwaitPage.tsx    # server-stream with <Await>
```

Each script boots a Vite server in middleware mode, uses `ssrLoadModule`
to load the matching page compiled to the requested SSR target, and
exercises the resulting function. `renderToString(App)` joins all
chunks; calling `App({ append })` directly observes the chunk order.

## Related code in the framework

- `packages/server/src/index.ts` — `renderToString`, the streaming
  sink contract, and the `<Await>` boundary machinery.
- `packages/compiler/src/emit-server.ts` and
  `emit-server-stream.ts` — the two server target emitters.

## What this example does NOT show

- Hydration of streamed HTML on the client — see
  [`../selective-hydration/`](../selective-hydration).
- File-based routing on top of streaming — see
  [`../app-router/`](../app-router) (`/streaming` stop).
