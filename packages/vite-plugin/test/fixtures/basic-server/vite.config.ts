import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { modularReact } from "../../../src/index";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

export default defineConfig({
  plugins: [modularReact()],
  resolve: {
    alias: {
      "@reckona/mreact-reactive-core/testing": `${repoRoot}/packages/reactive-core/src/testing.ts`,
      "@reckona/mreact-reactive-core/internal": `${repoRoot}/packages/reactive-core/src/internal.ts`,
      "@reckona/mreact-reactive-core": `${repoRoot}/packages/reactive-core/src/index.ts`,
      "@reckona/mreact-reactive-dom": `${repoRoot}/packages/reactive-dom/src/index.ts`,
      "@reckona/mreact-compiler": `${repoRoot}/packages/compiler/src/index.ts`,
      "@reckona/mreact-vite": `${repoRoot}/packages/vite-plugin/src/index.ts`,
    },
  },
});
