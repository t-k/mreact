# Container Deployment

mreact app-router builds can run in any platform that starts an HTTP server from
a container, including Cloud Run, AWS App Runner, Fly.io, Render, and similar
services.

## Generated Files

`create-mreact-app --deploy container` adds:

- `Dockerfile`
- `.dockerignore`
- `docs/deploy/container.md`

The generated image uses Node 24 LTS, sets `PORT=8080`, runs the app build, and
starts the compiled `.mreact` output through the package `start` script.

## Dockerfile Shape

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

The package `start` script should call:

```bash
mreact-router start .mreact
```

## Local Build

```bash
pnpm build
docker build -t mreact-app .
docker run --rm -p 8080:8080 -e PORT=8080 mreact-app
```

The server reads `PORT` from the environment. The Dockerfile sets `PORT=8080`
for local runs, which matches Cloud Run's common default and is also a simple
default for App Runner.

## Cloud Run

Cloud Run injects `PORT` automatically. Build and deploy the image with your
preferred Google Cloud workflow, then route HTTP traffic to the container.

Typical settings:

- Container port: `8080`
- Startup command: use the Dockerfile default
- Health check path: `/`
- Static assets: serve from the app server or move `.mreact/client` to a CDN

## AWS App Runner

AWS App Runner can use the same image. Configure the service port as `8080`, or
set `PORT` to the value you choose for the service.

Typical settings:

- Runtime: container image
- Port: `8080`
- Start command: use the Dockerfile default
- Health check path: `/`

## CDN Assets

The build writes client route assets to `.mreact/client`. Public files from
`public/` are copied to `.mreact/client/public`.

By default, the mreact server serves:

- `/_mreact/client/*`
- root public paths such as `/styles.css`

To serve static assets from a CDN, upload `.mreact/client` to your static origin
and configure the router:

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
HTML. `publicAssetBaseUrl` is persisted in the server manifest for public asset
helpers and deployment tooling.

Hashed route assets can use a long immutable cache. `manifest.json` and
non-fingerprinted public assets should use a shorter cache or revalidation.
