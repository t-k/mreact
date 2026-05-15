import { resolve } from "node:path";
import { defineConfig } from "vite";
import { modularReact } from "@reckona/mreact-vite";

export default defineConfig({
  plugins: [modularReact({ mode: "reactive" })],
  resolve: {
    dedupe: [
      "@reckona/mreact-reactive-core",
      "@reckona/mreact-reactive-dom",
      "@reckona/mreact-store",
    ],
  },
  build: {
    target: "esnext",
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        cart: resolve(__dirname, "cart.html"),
        selectors: resolve(__dirname, "selectors.html"),
        subscribe: resolve(__dirname, "subscribe.html"),
      },
    },
  },
  server: { open: "/index.html" },
});
