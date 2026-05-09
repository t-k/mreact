import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { modularReact } from "../../../src/index";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

export default defineConfig({
  plugins: [modularReact()],
  resolve: {
    alias: {
      "@modular-react/reactive-core": `${repoRoot}/packages/reactive-core/src/index.ts`,
      "@modular-react/reactive-core/testing": `${repoRoot}/packages/reactive-core/src/testing.ts`,
      "@modular-react/reactive-dom": `${repoRoot}/packages/reactive-dom/src/index.ts`,
      "@modular-react/compiler": `${repoRoot}/packages/compiler/src/index.ts`,
      "@modular-react/vite": `${repoRoot}/packages/vite-plugin/src/index.ts`,
    },
  },
});
