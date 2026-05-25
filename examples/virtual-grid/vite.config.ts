import { resolve } from "node:path";
import { defineConfig } from "vite";
import { modularReact } from "@reckona/mreact-vite";

export default defineConfig({
  plugins: [modularReact({ mode: "reactive" })],
  resolve: {
    dedupe: [
      "@reckona/mreact-reactive-core",
      "@reckona/mreact-reactive-dom",
      "@reckona/mreact-virtual",
    ],
  },
  build: {
    target: "esnext",
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
      },
    },
  },
  server: { open: "/index.html" },
});
