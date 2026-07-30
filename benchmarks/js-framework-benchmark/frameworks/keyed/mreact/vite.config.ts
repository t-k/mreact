import { defineConfig } from "vite";

export default defineConfig({
  define: {
    __MREACT_CLIENT_DEVTOOLS__: "false",
  },
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
