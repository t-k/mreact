import { defineConfig } from "vite";

export default defineConfig({
  define: {
    __MREACT_CLIENT_DEVTOOLS__: "false",
  },
  build: {
    emptyOutDir: true,
    minify: "oxc",
    rolldownOptions: {
      input: "src/main.ts",
      output: {
        entryFileNames: "main.js",
      },
    },
  },
});
