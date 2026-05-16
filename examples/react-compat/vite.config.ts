import { defineConfig } from "vite";
import { modularReact } from "@reckona/mreact-vite";

// `react` and `react-dom` in this workspace are workspace shims that
// re-export from @reckona/mreact-compat. Importing them looks like
// a normal React app from the source side; the compiler lowers JSX to
// the compat runtime.
export default defineConfig({
  plugins: [
    modularReact({ include: /\.compat\.[cm]?[jt]sx$/, mode: "compat" }),
    modularReact({ include: /(?<!\.compat)\.[cm]?[jt]sx$/, mode: "compat" }),
  ],
  resolve: {
    alias: {
      react: "@reckona/mreact",
      "react-dom": "@reckona/mreact-dom",
      "react-dom/client": "@reckona/mreact-dom/client",
    },
    dedupe: [
      "react",
      "react-dom",
      "@reckona/mreact-compat",
      "@reckona/mreact-reactive-core",
      "@reckona/mreact-reactive-dom",
    ],
  },
});
