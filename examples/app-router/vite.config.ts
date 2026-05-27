// Canonical mreact-router project config.
//
// `mreact-router build` / `mreact-router dev` (and the Vite middleware)
// read project paths from this file. The legacy CLI form that takes a
// positional `appDir` is still supported for tests / programmatic use,
// but new apps should configure the router here.
import { defineConfig } from "vite";
import { mreactRouter } from "@reckona/mreact-router/vite";

export default defineConfig({
  server: {
    port: 3001,
  },
  plugins: [
    mreactRouter({
      // Keep the example's flat layout: routes live directly under app/.
      // `create-mreact-app` uses the same layout unless --src-dir is passed.
      projectRoot: __dirname,
      routesDir: "app",
      publicDir: "public",
    }),
  ],
});
