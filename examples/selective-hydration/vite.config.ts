import { defineConfig } from "vite";
import { modularReact } from "@reckona/mreact-vite";

export default defineConfig({
  plugins: [
    modularReact({
      include: /\.compat\.[cm]?[jt]sx$/,
      mode: "compat",
      serverHydration: true,
    }),
    modularReact({
      include: /(?<!\.compat)\.[cm]?[jt]sx$/,
      mode: "reactive",
    }),
  ],
  resolve: {
    dedupe: [
      "@reckona/mreact-compat",
      "@reckona/mreact-reactive-core",
      "@reckona/mreact-reactive-dom",
      "@reckona/mreact-server",
    ],
  },
});
