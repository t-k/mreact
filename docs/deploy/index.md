# Deployment

mreact app-router builds can target Node/container hosts, AWS Lambda, Cloudflare Workers, Cloudflare Pages advanced mode, static export workflows, and CDN-backed asset hosting.

## Guides

- [Container Deployment](container.md): run the Node server output from a container image on Cloud Run, AWS App Runner, Fly.io, Render, and similar platforms.
- [AWS Lambda Deployment](aws-lambda.md): build, package, preload, and diagnose AWS Lambda handlers.
- [Cloudflare Deployment](cloudflare.md): build generated Workers artifacts and package Cloudflare Pages advanced mode output.
- [CDN Assets](assets.md): serve `.mreact/client` from a static origin, configure asset base URLs, and control production client source maps.

## Build Targets

Use `mreact-router build --target=node` for plain Node or container output, `mreact-router build --target=aws-lambda` for Lambda artifacts with a generated handler and import policy, or `mreact-router build --target=cloudflare` for Workers artifacts with a generated Worker module.

Configure `buildTargets: ["node"]`, `["aws-lambda"]`, or `["cloudflare"]` in `mreactRouter()` when one deployment target should be the project default.

## Production Host Policy

For public deployments, set `allowedHosts` to the exact hosts your app serves. Use `hostPolicy: "strict"` to fall back to the configured hostname and port when a request Host is not allow-listed. Use `hostPolicy: "trusted-proxy"` only when a trusted reverse proxy normalizes the Host header before traffic reaches mreact.

Use `onResponse` to add global headers to the final `Response`; it runs for rendered pages, route handlers, middleware responses, redirects, errors, prerendered routes, built static/client assets returned through the built app runtime, and Cloudflare adapter responses.
