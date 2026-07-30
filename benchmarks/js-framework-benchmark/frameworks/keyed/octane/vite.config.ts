import { octane } from "@octanejs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [octane()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    emptyOutDir: true,
    lib: {
      entry: "src/main.tsrx",
      fileName: () => "main.js",
      formats: ["es"],
    },
    rollupOptions: {
      output: {
        entryFileNames: "main.js",
      },
    },
  },
});
