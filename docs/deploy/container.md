# Container Deployment

mreact app-router builds can run on any platform that starts an HTTP server from a container, including Cloud Run, AWS App Runner, Fly.io, Render, and similar services.

## Generated Files

`create-mreact-app --deploy container` adds:

- `Dockerfile`
- `.dockerignore`
- `docs/deploy/container.md`

The generated image uses Node 24 LTS, sets `HOST=0.0.0.0`, `MREACT_ROUTER_HOST_POLICY=strict`, and `PORT=8080`, builds with `mreact-router build --target=node`, and starts the compiled `.mreact` output through the package `start` script.

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
ENV HOST=0.0.0.0
ENV MREACT_ROUTER_HOST_POLICY=strict
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

Build the project and image with a Docker-compatible container CLI such as Podman, then run the container with the same host and port settings used by the generated Dockerfile:

```bash
pnpm build
podman build -t mreact-app .
podman run --rm -p 8080:8080 -e HOST=0.0.0.0 -e MREACT_ROUTER_HOST_POLICY=strict -e PORT=8080 mreact-app
```

The server reads `HOST`, `MREACT_ROUTER_HOST_POLICY`, `MREACT_ROUTER_ALLOWED_HOSTS`, and `PORT` from the environment. The Dockerfile sets `HOST=0.0.0.0` so published container ports can reach the Node server, sets `MREACT_ROUTER_HOST_POLICY=strict` so public containers do not implicitly trust arbitrary Host headers, and sets `PORT=8080` for local runs, which matches Cloud Run's common default and is also a simple default for App Runner. Set `MREACT_ROUTER_ALLOWED_HOSTS` to the exact deployed hostnames when the app needs the public origin for absolute URLs.

## Cloud Run

Cloud Run injects `PORT` automatically. The Dockerfile already binds the server to `0.0.0.0` and uses strict Host header handling. Build and deploy the image with your preferred Google Cloud workflow, then route HTTP traffic to the container.

Typical settings:

- Container port: `8080`
- Startup command: use the Dockerfile default
- Health check path: `/`
- Static assets: serve from the app server or move `.mreact/client` to a CDN

## AWS App Runner

AWS App Runner can use the same image. Configure the service port as `8080`, or set `PORT` to the value you choose for the service.

Typical settings:

- Runtime: container image
- Port: `8080`
- Start command: use the Dockerfile default
- Health check path: `/`

## CDN Assets

Container deployments can serve `.mreact/client` through the app server, but production sites often move those files to a static origin or CDN. See [CDN Assets](assets.md) for `assetBaseUrl`, `publicAssetBaseUrl`, and cache-control guidance.
