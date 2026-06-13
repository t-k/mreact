import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const labRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(labRoot, "../..");
const runtime = process.env.COMPAT_LAB_RUNTIME === "compat" ? "compat" : "react";

const reactAliases = [
  {
    find: "react/jsx-dev-runtime",
    replacement: resolve(repoRoot, "node_modules/react/jsx-dev-runtime.js"),
  },
  {
    find: "react/jsx-runtime",
    replacement: resolve(repoRoot, "node_modules/react/jsx-runtime.js"),
  },
  { find: "react-dom/client", replacement: resolve(repoRoot, "node_modules/react-dom/client.js") },
  { find: "react-dom/server", replacement: resolve(repoRoot, "node_modules/react-dom/server.js") },
  { find: "react-dom", replacement: resolve(repoRoot, "node_modules/react-dom/index.js") },
  { find: "react", replacement: resolve(repoRoot, "node_modules/react/index.js") },
];

const radixPackages = [
  "@radix-ui/react-accordion",
  "@radix-ui/react-alert-dialog",
  "@radix-ui/react-aspect-ratio",
  "@radix-ui/react-avatar",
  "@radix-ui/react-checkbox",
  "@radix-ui/react-collapsible",
  "@radix-ui/react-context-menu",
  "@radix-ui/react-dialog",
  "@radix-ui/react-dropdown-menu",
  "@radix-ui/react-form",
  "@radix-ui/react-hover-card",
  "@radix-ui/react-label",
  "@radix-ui/react-menubar",
  "@radix-ui/react-navigation-menu",
  "@radix-ui/react-one-time-password-field",
  "@radix-ui/react-password-toggle-field",
  "@radix-ui/react-popover",
  "@radix-ui/react-progress",
  "@radix-ui/react-radio-group",
  "@radix-ui/react-scroll-area",
  "@radix-ui/react-select",
  "@radix-ui/react-separator",
  "@radix-ui/react-slider",
  "@radix-ui/react-switch",
  "@radix-ui/react-tabs",
  "@radix-ui/react-toast",
  "@radix-ui/react-toggle",
  "@radix-ui/react-toggle-group",
  "@radix-ui/react-toolbar",
  "@radix-ui/react-tooltip",
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
        {
          find: "react-dom/client",
          replacement: resolve(repoRoot, "packages/react-compat/dist/index.js"),
        },
        {
          find: "react-dom/server",
          replacement: resolve(repoRoot, "packages/react-compat/dist/index.js"),
        },
        {
          find: "react-dom",
          replacement: resolve(repoRoot, "packages/react-compat/dist/index.js"),
        },
        { find: "react", replacement: resolve(repoRoot, "packages/react-compat/dist/index.js") },
      ]
    : reactAliases;

const optimizeDeps =
  runtime === "compat"
    ? {
        include: radixPackages,
        exclude: [
          "@reckona/mreact-compat",
          "@reckona/mreact-reactive-core",
          "@reckona/mreact-shared",
        ],
        rolldownOptions: {
          external: [
            "react",
            "react-dom",
            "react-dom/client",
            "react-dom/server",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
          ],
        },
      }
    : {
        include: radixPackages,
        exclude: [],
      };

export default defineConfig({
  cacheDir: resolve(repoRoot, "node_modules/.vite/compat-lab-radix", runtime),
  define: {
    "window.__COMPAT_LAB_RUNTIME__": JSON.stringify(runtime),
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  optimizeDeps: {
    ...optimizeDeps,
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
