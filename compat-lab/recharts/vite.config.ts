import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const labRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(labRoot, "../..");
const runtime = process.env.COMPAT_LAB_RUNTIME === "compat" ? "compat" : "react";

const compatAliases =
  runtime === "compat"
    ? {
        react: resolve(repoRoot, "packages/react-compat/dist/index.js"),
        "react-dom": resolve(repoRoot, "packages/react-compat/dist/index.js"),
        "react-dom/client": resolve(repoRoot, "packages/react-compat/dist/index.js"),
        "react-dom/server": resolve(repoRoot, "packages/react-compat/dist/index.js"),
        "react/jsx-runtime": resolve(repoRoot, "packages/react-compat/dist/jsx-runtime.js"),
        "react/jsx-dev-runtime": resolve(repoRoot, "packages/react-compat/dist/jsx-dev-runtime.js"),
      }
    : {};

export default defineConfig({
  cacheDir: resolve(repoRoot, "node_modules/.vite/compat-lab-recharts", runtime),
  define: {
    "globalThis.__COMPAT_LAB_RUNTIME__": JSON.stringify(runtime),
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  optimizeDeps: {
    include: ["recharts"],
  },
  resolve: {
    alias: compatAliases,
  },
  server: {
    host: "127.0.0.1",
    port: 0,
    strictPort: false,
  },
});
