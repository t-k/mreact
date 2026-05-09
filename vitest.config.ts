import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@modular-react/reactive-core/testing",
        replacement: new URL("./packages/reactive-core/src/testing.ts", import.meta.url).pathname,
      },
      {
        find: "@modular-react/reactive-core/internal",
        replacement: new URL("./packages/reactive-core/src/internal.ts", import.meta.url).pathname,
      },
      {
        find: "@modular-react/reactive-core",
        replacement: new URL("./packages/reactive-core/src/index.ts", import.meta.url).pathname,
      },
    ],
  },
  test: {
    environment: "node",
    include: ["packages/*/test/**/*.test.ts"],
  },
});
