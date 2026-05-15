import { defineConfig } from "vite";

// The plugin is added per-script (different `serverOutput` modes
// per demo) so this file just supplies the SSR-target boilerplate.
export default defineConfig({
  resolve: {
    dedupe: ["@reckona/mreact-reactive-core", "@reckona/mreact-server"],
  },
});
