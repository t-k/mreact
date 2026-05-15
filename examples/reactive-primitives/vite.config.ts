import { resolve } from "node:path";
import { defineConfig } from "vite";
import { modularReact } from "@reckona/mreact-vite";

export default defineConfig({
  plugins: [modularReact({ mode: "reactive" })],
  resolve: {
    dedupe: ["@reckona/mreact-reactive-core", "@reckona/mreact-reactive-dom"],
  },
  build: {
    target: "esnext",
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        counter: resolve(__dirname, "counter.html"),
        derived: resolve(__dirname, "derived.html"),
        effect: resolve(__dirname, "effect.html"),
      },
    },
  },
  server: { open: "/index.html" },
});
