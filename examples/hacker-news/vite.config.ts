import { defineConfig } from "vite";
import { mreactRouter } from "@reckona/mreact-router/vite";

export default defineConfig({
  server: {
    port: 3001,
  },
  plugins: [
    mreactRouter({
      buildTargets: ["cloudflare"],
      projectRoot: __dirname,
      routesDir: "src/app",
      publicDir: "public",
    }),
  ],
});
