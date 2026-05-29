# CDN Assets

Built client route assets are written to `.mreact/client`. Public files are copied from `public/` to `.mreact/client/public`.

By default, the mreact server serves those assets itself:

- `/_mreact/client/*`
- root public paths such as `/styles.css`

CSS imported from App Router pages, layouts, or templates is emitted as hashed route stylesheet assets under `.mreact/client/assets/routes/` and linked automatically from rendered HTML. In development, the Vite middleware links those source CSS imports through an mreact dev CSS proxy, so Vite CSS transforms and PostCSS plugins still run while layout-level CSS such as `import "./global.css";` paints without a manual `<link>`.

## CDN Configuration

To serve static assets from a CDN, upload `.mreact/client` to a static origin and configure base URLs in `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { mreactRouter } from "@reckona/mreact-router/vite";

export default defineConfig({
  plugins: [
    mreactRouter({
      projectRoot: __dirname,
      routesDir: "src/app",
      publicDir: "public",
      allowedSourceDirs: ["src"],
      assetBaseUrl: "https://cdn.example.com/_mreact/client/",
      publicAssetBaseUrl: "https://cdn.example.com/",
    }),
  ],
});
```

`assetBaseUrl` is used for route scripts, modulepreload links emitted into HTML, and built client-route dynamic import preload helpers. `publicAssetBaseUrl` is persisted in the server manifest and is intended for public asset helpers and deployment tooling. If these options are omitted, generated HTML and client chunk preloads stay on the existing root-relative paths.

## Cache Policy

Hashed route assets can use a long immutable cache. `manifest.json` and non-fingerprinted public assets should use a shorter cache or revalidation. When deploying through a CDN, keep the app server and CDN upload in the same release transaction so rendered HTML never points at missing route scripts or stylesheets.

## Production Client Source Maps

Production client source maps are disabled by default so route bundles do not expose original source paths or `sourcesContent` unless you opt in. Enable them from the router config used by the Vite plugin:

```ts
import { defineConfig } from "vite";
import { mreactRouter } from "@reckona/mreact-router/vite";

export default defineConfig({
  plugins: [
    mreactRouter({
      projectRoot: __dirname,
      routesDir: "src/app",
      clientSourceMaps: "hidden",
    }),
  ],
});
```

Use `clientSourceMaps: "linked"` to emit public `.js.map` files beside route scripts and include `sourceMappingURL` comments, or use `clientSourceMaps: "hidden"` to emit upload-only maps under `.mreact/source-maps/client/` without exposing them in the client manifest. The CLI accepts the same modes with `mreact-router build --client-source-maps=hidden`, `linked`, or `none`.
