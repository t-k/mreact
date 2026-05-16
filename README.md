# mreact

mreact is an experimental React-flavored framework with a compiler-first app
router, fine-grained reactive primitives, streaming SSR, and a small set of
application libraries for query state, forms, auth, and stores.

It is inspired by [Marko](https://markojs.com/)'s compiler-first model while
keeping JSX and a React-like authoring style.

## Status

mreact is experimental. APIs may change before a stable release. The current
workspace packages use the `@reckona/*` npm scope and currently start at
version `0.0.1`.

The repository targets Node `>=20.19.0` for development. Generated container
deploy scaffolds use Node 24 LTS.

## Quick Start

Create an app-router project:

```bash
npx @reckona/create-mreact-app my-app --template app-router --src-dir
cd my-app
pnpm install
pnpm dev
```

Create the Tailwind CSS template instead:

```bash
npx @reckona/create-mreact-app my-app --template app-router-tailwind --src-dir
```

Add generic container deploy files for Cloud Run, AWS App Runner, and similar
platforms:

```bash
npx @reckona/create-mreact-app my-app --template app-router --src-dir --deploy container
```

Generate an AWS Lambda entrypoint instead:

```bash
npx @reckona/create-mreact-app my-app --template app-router --src-dir --deploy aws-lambda
```

Generate a Cloudflare Workers-oriented template:

```bash
npx @reckona/create-mreact-app my-app --template cloudflare
```

Build and run production output:

```bash
pnpm build
pnpm start
```

The generated Vite config is explicit about app paths:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { mreactRouter } from "@reckona/mreact-router/vite";

export default defineConfig({
  plugins: [
    mreactRouter({
      routesDir: "src/app",
      publicDir: "public",
      allowedSourceDirs: ["src"],
    }),
  ],
});
```

A typical project layout:

```text
my-app/
  src/
    app/
      layout.tsx
      page.tsx
    lib/
      app-info.ts
  public/
  vite.config.ts
```

## Why mreact?

- **Fine-grained reactivity.** Update only the DOM nodes whose dependencies
  changed instead of re-rendering whole component subtrees.
- **Compiler-first rendering.** Work that can be decided once at build time
  should not be repeated in the browser on every render.
- **Route-level runtime inference.** Routes that use only server-rendered
  output do not need a client route bundle. Routes that use `cell()`, event
  handlers, or browser APIs get client runtime automatically for covered
  patterns.
- **Streaming SSR.** HTML is emitted through a coalescing UTF-8 buffer and can
  flush at shell, threshold, loading, and out-of-order fragment boundaries.
- **Dual server/client output.** The same source can compile to server HTML
  emission and client DOM mutation programs.
- **Small app primitives.** Query, form, auth, store, and router helpers are
  separate packages instead of one mandatory runtime.
- **Explicit deployment adapters.** Node, edge-style runtimes, Cloudflare
  Workers, AWS Lambda HTTP API v2, static export, and generic containers each
  have dedicated entry points or scaffolds.

## App Router Examples

Routes live under `app/` or `src/app/`. The router recognizes `page.tsx`,
`layout.tsx`, `template.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`,
`middleware.ts`, and `route.ts`.

```text
src/app/
  layout.tsx
  page.tsx
  counter/page.tsx
  users/$id/page.tsx
  files/$...path/page.tsx
  api/time/route.ts
```

### Static Page and Metadata

```tsx
// src/app/page.tsx
export const metadata = {
  title: "Home",
  description: "A server-rendered mreact page.",
};

export default function Page() {
  return (
    <main>
      <h1>Hello from mreact</h1>
      <p>This route has no client state, so it can render as static HTML.</p>
    </main>
  );
}
```

### Layouts and Slots

Layouts wrap child routes with `<Slot />`. Named slots let a child route fill a
specific region of a parent layout.

```tsx
// src/app/docs/layout.tsx
export const metadata = {
  title: "Docs",
  description: "Documentation section.",
};

export default function DocsLayout() {
  return (
    <section class="docs-layout">
      <aside>
        <nav>
          <a href="/docs">Overview</a>
          <a href="/docs/routing">Routing</a>
        </nav>
        <Slot name="aside" />
      </aside>
      <article>
        <Slot />
      </article>
    </section>
  );
}
```

```tsx
// src/app/docs/page.tsx
function TipAside() {
  return <p>Read the routing guide next.</p>;
}

export const slots = {
  aside: TipAside,
};

export default function Page() {
  return <h1>Docs overview</h1>;
}
```

### Client Interactivity

`cell()` values are tracked by the compiled client output. A route using
`cell()` and an event handler gets a client route bundle.

```tsx
// src/app/counter/page.tsx
import { cell } from "@reckona/mreact-reactive-core";

export default function CounterPage() {
  const count = cell(0);

  return (
    <button type="button" onClick={() => count.set((value) => value + 1)}>
      Count: {count.get()}
    </button>
  );
}
```

### Dynamic Routes, Loaders, and 404s

Use `$name` for dynamic segments and `$...name` for catch-all segments.
`loader()` runs before render and passes its return value as `props.data`.

```tsx
// src/app/users/$id/page.tsx
import { notFound } from "@reckona/mreact-router";

interface LoaderContext {
  params: { id: string };
  request: Request;
}

const users = new Map([
  ["ada", { name: "Ada Lovelace", role: "admin" }],
  ["grace", { name: "Grace Hopper", role: "editor" }],
]);

export const prerender = true;

export async function generateStaticParams() {
  return [...users.keys()].map((id) => ({ id }));
}

export async function loader(context: LoaderContext) {
  const user = users.get(context.params.id);
  if (user === undefined) notFound();
  return user;
}

export default function UserPage(props: {
  params: { id: string };
  data: { name: string; role: string };
}) {
  return (
    <main>
      <h1>{props.data.name}</h1>
      <p>Role: {props.data.role}</p>
    </main>
  );
}
```

```tsx
// src/app/files/$...path/page.tsx
export default function FilePage(props: { params: { path: string } }) {
  return <p>Requested file path: {props.params.path}</p>;
}
```

### Route Handlers

`route.ts` files expose HTTP method functions.

```ts
// src/app/api/time/route.ts
export function GET(): Response {
  return Response.json({
    now: new Date().toISOString(),
  });
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  return Response.json({ received: body });
}
```

### Middleware

Middleware can return a `Response` to short-circuit rendering, or return
`undefined` to continue.

```ts
// src/app/middleware.ts
import { redirect } from "@reckona/mreact-router";

export const config = {
  matcher: ["/blocked", "/admin/:path*"],
};

export async function middleware(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname === "/blocked") {
    return new Response("<h1>Blocked</h1>", {
      headers: { "content-type": "text/html; charset=utf-8" },
      status: 451,
    });
  }

  if (url.pathname.startsWith("/admin")) {
    const signedIn = request.headers.get("cookie")?.includes("sid=");
    if (!signedIn) redirect("/login");
  }

  return undefined;
}
```

### Streaming, Loading, and Await

Streaming routes can flush the shell while async work continues. A collocated
`loading.tsx` file supplies the loading boundary.

```tsx
// src/app/streaming/page.tsx
export const stream = true;

async function readFeed(): Promise<string[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return ["Compiler output", "Streaming shell", "Out-of-order fragment"];
}

export default function Page() {
  const feed = readFeed();

  return (
    <main>
      <h1>Streaming</h1>
      <Await value={feed} placeholder={<p>Loading feed...</p>}>
        {(items) => (
          <ul>
            {items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
      </Await>
    </main>
  );
}
```

```tsx
// src/app/streaming/loading.tsx
export default function Loading() {
  return <p>Preparing the stream...</p>;
}
```

### Server Actions and Route Cache

Server actions currently require a top-level `"use server"` directive in the
action module. The router only lowers imported functions from marked modules
when it sees `<form action={action}>`; this keeps ordinary imported functions
out of the server-action registry. Cached route HTML can be invalidated with
`revalidatePath()`.

```tsx
// src/app/server-actions/page.tsx
import { addNote } from "./actions.js";
import { listNotes } from "./store.js";

export const revalidate = 30;

export default function Page() {
  return (
    <main>
      <form method="post" action={addNote}>
        <input name="text" required maxlength="200" />
        <button type="submit">Add note</button>
      </form>
      <ul>
        {listNotes().map((note) => (
          <li key={note.id}>{note.text}</li>
        ))}
      </ul>
    </main>
  );
}
```

```ts
// src/app/server-actions/actions.ts
"use server";

import { revalidatePath } from "@reckona/mreact-router";
import { addNoteToStore } from "./store.js";

export async function addNote(formData: FormData): Promise<void> {
  const raw = formData.get("text");
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length > 200) {
    throw new Error("Note text must be at most 200 characters.");
  }
  if (text.length > 0) {
    addNoteToStore(text);
    revalidatePath("/server-actions");
  }
}
```

Use runtime cache control when the policy depends on request data:

```ts
// src/app/products/$id/page.tsx
import { cacheControl } from "@reckona/mreact-router";

export async function loader() {
  cacheControl({
    sMaxAge: 60,
    staleWhileRevalidate: 300,
  });

  return { generatedAt: new Date().toISOString() };
}
```

### Query Prefetch and Hydration

`@reckona/mreact-query` provides a tiny query client. The router gives loaders
a per-request `QueryClient`; after render it dehydrates the cache into HTML.

```tsx
// src/app/query/page.tsx
import {
  createQuery,
  getQueryClient,
  type QueryClient,
} from "@reckona/mreact-query";

const TIME_KEY = ["time"] as const;

async function fetchTime() {
  return { value: new Date().toISOString() };
}

export async function loader(context: { queryClient: QueryClient }) {
  return context.queryClient.fetchQuery({
    queryKey: TIME_KEY,
    queryFn: fetchTime,
  });
}

export default function Page(props: { data: { value: string } }) {
  const query = createQuery(getQueryClient(), {
    queryKey: TIME_KEY,
    queryFn: fetchTime,
  });
  const result = query.result.get();

  return (
    <main>
      <p>Loader value: {props.data.value}</p>
      <p>Reactive value: {result.data?.value ?? "pending"}</p>
    </main>
  );
}
```

### Forms

`@reckona/mreact-forms` keeps form state in reactive cells and can map server
validation errors back to fields.

```tsx
// src/app/contact/page.tsx
import { createForm } from "@reckona/mreact-forms";

interface ContactValues {
  email: string;
  message: string;
}

export default function Page() {
  const form = createForm<ContactValues>({
    initialValues: { email: "", message: "" },
    validateOn: ["change", "blur"],
    validate: {
      email: (value) => value.includes("@") ? undefined : "Enter a valid email.",
      message: (value) => value.length >= 10 ? undefined : "Write at least 10 characters.",
    },
  });

  async function submit() {
    const result = await form.submit(async (values) => {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        form.setServerErrors(await response.json());
        return;
      }

      form.reset();
    });

    if (result.status === "error") {
      form.setErrors({ root: ["Could not submit the form."] });
    }
  }

  const state = form.state.get();

  return (
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <input
        value={state.values.email}
        onInput={(event) =>
          void form.setValue("email", (event.target as HTMLInputElement).value)}
      />
      <textarea
        value={state.values.message}
        onInput={(event) =>
          void form.setValue("message", (event.target as HTMLTextAreaElement).value)}
      />
      <button type="submit" disabled={state.submitting}>Send</button>
    </form>
  );
}
```

### Auth

`@reckona/mreact-auth` builds on router sessions and adds role/permission
guards.

```ts
// src/app/session-store.ts
import {
  configureAuth,
  createMemorySessionStore,
} from "@reckona/mreact-auth";

export interface SessionData {
  userId: string;
  roles: string[];
}

export const sessions = createMemorySessionStore<SessionData>();

configureAuth({
  redirectTo: "/login",
  forbiddenTo: "/forbidden",
});
```

```tsx
// src/app/admin/audit/page.tsx
import { requireRole } from "@reckona/mreact-auth";
import { sessions, type SessionData } from "../../session-store.js";

export async function loader(context: { request: Request }) {
  const session = await requireRole<SessionData>(
    context.request,
    sessions,
    "admin",
  );

  return { userId: session.data.userId };
}

export default function Page(props: { data: { userId: string } }) {
  return <h1>Audit log for {props.data.userId}</h1>;
}
```

### i18n Helpers

`defineMessages()` keeps message bundles typed. `detectLocale()` can read from
the URL prefix or `Accept-Language`.

```ts
// src/app/i18n/messages.ts
import { defineMessages } from "@reckona/mreact-router";

export const messages = defineMessages({
  en: { heading: "Locale detection", welcome: "Hello!" },
  ja: { heading: "Locale detection (ja)", welcome: "Hello from ja!" },
});
```

```tsx
// src/app/i18n/page.tsx
import { detectLocale } from "@reckona/mreact-router";
import { messages } from "./messages.js";

export function loader(context: { request: Request }) {
  return detectLocale(context.request, {
    defaultLocale: "en",
    locales: ["en", "ja"],
  });
}

export default function Page(props: { data: { locale: "en" | "ja" } }) {
  const t = messages[props.data.locale];
  return <h1>{t.heading}</h1>;
}
```

### Deployment Adapters

The router provides adapters for common deployment shapes:

```ts
// Node http server
import { createNodeRequestHandler } from "@reckona/mreact-router/adapters/node";

const handler = createNodeRequestHandler({
  outDir: ".mreact",
  port: 3000,
});
```

```ts
// Edge-style runtime
import { createEdgeRequestHandler } from "@reckona/mreact-router/adapters/edge";

const handler = createEdgeRequestHandler({
  render(request) {
    const url = new URL(request.url);
    return new Response(`<h1>${url.pathname}</h1>`, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
});

export default {
  fetch(request: Request) {
    return handler(request);
  },
};
```

Additional adapters are available at:

- `@reckona/mreact-router/adapters/aws-lambda`
- `@reckona/mreact-router/adapters/cloudflare`
- `@reckona/mreact-router/adapters/static`

```ts
// AWS Lambda HTTP API v2 / Lambda Function URL
import { createAwsLambdaRequestHandler } from "@reckona/mreact-router/adapters/aws-lambda";

export const handler = createAwsLambdaRequestHandler({
  outDir: ".mreact",
});
```

### Container Deploy

`create-mreact-app --deploy container` generates a vendor-neutral `Dockerfile`,
`.dockerignore`, and `docs/deploy/container.md`. The generated image uses Node
24 LTS, sets `PORT=8080`, builds with `mreact-router build`, and starts with
`mreact-router start .mreact` through the package `start` script.

The same container shape works for Cloud Run, AWS App Runner, Fly.io, Render,
and other platforms that run an HTTP server from a container:

```Dockerfile
FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile || pnpm install

FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app ./
RUN pnpm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
RUN corepack enable
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.mreact ./.mreact
EXPOSE 8080
CMD ["pnpm", "start"]
```

### AWS Lambda Deploy

`create-mreact-app --deploy aws-lambda` generates `src/lambda.ts` and
`docs/deploy/aws-lambda.md`. The generated handler targets API Gateway HTTP API
v2 and Lambda Function URL payload format 2.0:

```ts
import { createAwsLambdaRequestHandler } from "@reckona/mreact-router/adapters/aws-lambda";

export const handler = createAwsLambdaRequestHandler({
  outDir: new URL("../.mreact", import.meta.url).pathname,
});
```

Lambda proxy responses are buffered, so this adapter does not provide true
response streaming. For production, serve `.mreact/client` from S3 + CloudFront
or another CDN and configure `assetBaseUrl` / `publicAssetBaseUrl`.

### CDN Asset Base URLs

Built client route assets are written to `.mreact/client`. Public files are
copied from `public/` to `.mreact/client/public`. By default, the mreact server
serves those assets itself:

- `/_mreact/client/*`
- root public paths such as `/styles.css`

To serve static assets from a CDN, upload `.mreact/client` to a static origin
and configure base URLs in `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { mreactRouter } from "@reckona/mreact-router/vite";

export default defineConfig({
  plugins: [
    mreactRouter({
      routesDir: "src/app",
      publicDir: "public",
      allowedSourceDirs: ["src"],
      assetBaseUrl: "https://cdn.example.com/_mreact/client/",
      publicAssetBaseUrl: "https://cdn.example.com/",
    }),
  ],
});
```

`assetBaseUrl` is used for route scripts and modulepreload links emitted into
HTML. `publicAssetBaseUrl` is persisted in the server manifest and is intended
for public asset helpers and deployment tooling. If these options are omitted,
the generated HTML stays on the existing root-relative paths.

## Reactive Primitives

Use `@reckona/mreact-reactive-core` outside the router or inside compiled
routes.

```ts
import { batch, cell, computed, effect } from "@reckona/mreact-reactive-core";

const first = cell("Ada");
const last = cell("Lovelace");
const fullName = computed(() => `${first.get()} ${last.get()}`);

const dispose = effect(() => {
  console.log(fullName.get());
});

batch(() => {
  first.set("Grace");
  last.set("Hopper");
});

dispose();
```

## Store

`@reckona/mreact-store` wraps reactive state with patch updates, transactions,
selectors, subscriptions, and optional persistence/instrumentation hooks.

```ts
import { createStore, shallowEqual } from "@reckona/mreact-store";

interface CartState {
  lines: Array<{ id: string; quantity: number }>;
  promoCode: string | null;
}

const cart = createStore<CartState>({
  lines: [{ id: "book", quantity: 1 }],
  promoCode: null,
});

const itemCount = cart.select(
  (state) => state.lines.reduce((total, line) => total + line.quantity, 0),
);

cart.transaction(() => {
  cart.set({ promoCode: "MREACT10" });
  cart.update((state) => ({
    lines: state.lines.map((line) =>
      line.id === "book" ? { ...line, quantity: line.quantity + 1 } : line,
    ),
  }));
});

cart.select((state) => ({ promoCode: state.promoCode }), shallowEqual);
console.log(itemCount.get());
```

## React Compatibility

`@reckona/mreact` and `@reckona/mreact-dom` expose React-like entry points for
compatibility-oriented builds.

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@reckona/mreact"
  }
}
```

```tsx
import { Suspense, lazy, useEffect, useState } from "@reckona/mreact";
import { createRoot } from "@reckona/mreact-dom/client";

const LazyPanel = lazy(() => import("./Panel.js"));

function App() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    document.title = `count = ${count}`;
  }, [count]);

  return (
    <main>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Count: {count}
      </button>
      <Suspense fallback={<p>Loading...</p>}>
        <LazyPanel />
      </Suspense>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
```

For source that imports `react` and `react-dom`, configure your bundler to
resolve those specifiers to the mreact shim packages or use the workspace
example in `examples/react-compat`.

## SSR Without the App Router

`@reckona/mreact-server` can render compiled server-stream functions to strings
or streaming sinks directly.

```ts
import { renderToString, type HtmlSink } from "@reckona/mreact-server";

function Page(sink: HtmlSink) {
  sink.append("<main>");
  sink.append("<h1>Server HTML</h1>");
  sink.append("<p>Rendered without the app router.</p>");
  sink.append("</main>");
}

const html = await renderToString(Page);
```

For lower-level streaming, pass a sink to a compiled server-stream module:

```ts
const chunks: string[] = [];

await Page({
  append(chunk: string) {
    chunks.push(chunk);
  },
});
```

## Benchmarks

The repository contains two benchmark suites:

- `benchmarks/primitive`: primitive UI/reactivity comparisons across mreact,
  React, Solid, Svelte, Qwik, Marko, and beta variants where available.
- `benchmarks/router`: app-router comparisons across mreact app router,
  Next.js App Router, Qwik City, SolidStart, TanStack Start, Marko Run, and
  beta variants where available.

Run them from the repo root:

```bash
pnpm bench:primitive
pnpm bench:router
pnpm bench:all
```

Current checked-in reports live under `benchmarks/results/`.

## API Reference

Generated API documentation is checked in under `docs/api` and can be opened
directly from `docs/api/index.html`. The generated reference is built from the
workspace package entry points declared in each package's `package.json`.

API Extractor reports live under `etc/api`. These Markdown reports are intended
for reviewing public API signature drift during release work and CI.

```bash
pnpm docs:api
pnpm docs:api:check
pnpm api:report
pnpm api:report:check
```

## Examples

The `examples/` directory contains focused applications:

| Example | What it demonstrates |
| --- | --- |
| `examples/app-router` | Full app-router tour: layouts, metadata, streaming, server actions, cache, route handlers, middleware, auth, query, forms, i18n, deployment adapters |
| `examples/reactive-primitives` | `cell`, `computed`, `effect`, and DOM updates |
| `examples/store` | Shared store, selectors, transactions, and subscriptions |
| `examples/ssr-streaming` | String rendering, streaming rendering, and async boundaries |
| `examples/react-compat` | React-like hooks, Suspense, lazy, and DOM root entry points |
| `examples/selective-hydration` | Selective hydration without the app router |

## Packages

| Package | Purpose |
| --- | --- |
| `@reckona/mreact` | React-like public runtime entry point |
| `@reckona/mreact-dom` | React DOM-compatible client and server entry points |
| `@reckona/mreact-compat` | Compatibility runtime used by the public React-like packages |
| `@reckona/mreact-scheduler` | Scheduler compatibility package |
| `@reckona/mreact-compiler` | TSX compiler for client and server targets |
| `@reckona/mreact-reactive-core` | `cell`, `computed`, `effect`, `batch`, and dependency tracking |
| `@reckona/mreact-reactive-dom` | DOM bindings for text, lists, events, props, and hydration |
| `@reckona/mreact-server` | SSR string, stream, async boundary, and Flight helpers |
| `@reckona/mreact-router` | File-system app router, build pipeline, server actions, cache, adapters |
| `@reckona/mreact-vite` | Standalone Vite plugin for compatibility-oriented builds |
| `@reckona/mreact-shared` | Shared HTML escaping and URL safety helpers |
| `@reckona/mreact-query` | Query cache, mutation observer, dehydration, client hand-off |
| `@reckona/mreact-store` | Global/client state primitives |
| `@reckona/mreact-auth` | Session and authorization helpers |
| `@reckona/mreact-forms` | Form validation and server-action error integration |
| `@reckona/mreact-devtools` | Shared development event hooks |
| `@reckona/mreact-test-utils` | Router and SSR testing helpers |
| `@reckona/create-mreact-app` | Project scaffolder |
| `@reckona/mreact-router-native` | Optional native route matcher package with platform variants |
| `@reckona/mreact-router-native-linux-x64-gnu` | Linux x64 glibc native addon package |
| `@reckona/mreact-router-native-darwin-arm64` | macOS arm64 native addon package |
| `@reckona/mreact-router-native-win32-x64-msvc` | Windows x64 MSVC native addon package |
| `@reckona/mreact-next` | Experimental Next-oriented compiler integration |

## Monorepo Development

Install dependencies and build packages:

```bash
pnpm install
pnpm build
```

Run tests:

```bash
pnpm test
pnpm test:e2e
```

Run the app-router example:

```bash
pnpm example:mreact-app-router:dev
```

Generate and check API documentation:

```bash
pnpm docs:api
pnpm docs:api:check
pnpm api:report
pnpm api:report:check
```

`docs/api` contains the generated TypeDoc HTML reference and is intentionally
committed. `etc/api` contains API Extractor reports used to review public API
signature changes.

Verify package tarballs before publishing:

```bash
pnpm publish:verify
```

## License

MIT
