import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const labRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(labRoot, "../..");
const runtime = process.env.COMPAT_LAB_RUNTIME === "compat" ? "compat" : "react";

const reactAliases = [
  { find: "react/jsx-dev-runtime", replacement: resolve(repoRoot, "node_modules/react/jsx-dev-runtime.js") },
  { find: "react/jsx-runtime", replacement: resolve(repoRoot, "node_modules/react/jsx-runtime.js") },
  { find: "react-dom/client", replacement: resolve(repoRoot, "node_modules/react-dom/client.js") },
  { find: "react-dom/server", replacement: resolve(repoRoot, "node_modules/react-dom/server.js") },
  { find: "react-dom", replacement: resolve(repoRoot, "node_modules/react-dom/index.js") },
  { find: "react", replacement: resolve(repoRoot, "node_modules/react/index.js") },
];

const compatAliases =
  runtime === "compat"
    ? [
        {
          find: "react/jsx-dev-runtime",
          replacement: resolve(repoRoot, "packages/react-compat/dist/jsx-dev-runtime.js"),
        },
        {
          find: "react/jsx-runtime",
          replacement: resolve(repoRoot, "packages/react-compat/dist/jsx-runtime.js"),
        },
        { find: "react-dom/client", replacement: resolve(repoRoot, "packages/react-compat/dist/index.js") },
        { find: "react-dom/server", replacement: resolve(repoRoot, "packages/react-compat/dist/index.js") },
        { find: "react-dom", replacement: resolve(repoRoot, "packages/react-compat/dist/index.js") },
        { find: "react", replacement: resolve(repoRoot, "packages/react-compat/dist/index.js") },
      ]
    : reactAliases;

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
    exclude:
      runtime === "compat"
        ? ["@reckona/mreact-compat", "@reckona/mreact-reactive-core", "@reckona/mreact-shared"]
        : [],
    rolldownOptions:
      runtime === "compat"
        ? {
            external: [
              "react",
              "react-dom",
              "react-dom/client",
              "react-dom/server",
              "react/jsx-runtime",
              "react/jsx-dev-runtime",
            ],
          }
        : undefined,
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
