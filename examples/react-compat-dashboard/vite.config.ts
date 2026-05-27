import { defineConfig } from "vite";
import { mreactRouter } from "@reckona/mreact-router/vite";

export default defineConfig({
  server: {
    port: 3013,
  },
  optimizeDeps: {
    exclude: ["better-sqlite3"],
  },
  plugins: [
    mreactRouter({
      projectRoot: __dirname,
      routesDir: "app",
      publicDir: "public",
      allowedSourceDirs: ["app"],
      importPolicy: {
        allowedPackages: ["better-sqlite3"],
      },
    }),
  ],
});
