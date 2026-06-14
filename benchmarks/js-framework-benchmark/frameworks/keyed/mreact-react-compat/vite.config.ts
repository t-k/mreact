import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: "src/main.ts",
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
