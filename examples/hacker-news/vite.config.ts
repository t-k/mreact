import { defineConfig } from "vite";
import { mreactRouter } from "@reckona/mreact-router/vite";

export default defineConfig({
  plugins: [
    mreactRouter({
      projectRoot: __dirname,
      routesDir: "src/app",
      publicDir: "public",
      allowedSourceDirs: ["src"],
    }),
  ],
});
