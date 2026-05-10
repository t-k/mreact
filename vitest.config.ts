import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@modular-react/vite",
        replacement: new URL("./packages/vite-plugin/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@modular-react/compiler",
        replacement: new URL("./packages/compiler/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@modular-react/react-compat/jsx-runtime",
        replacement: new URL("./packages/react-compat/src/jsx-runtime.ts", import.meta.url)
          .pathname,
      },
      {
        find: "@modular-react/react-compat",
        replacement: new URL("./packages/react-compat/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@modular-react/reactive-dom",
        replacement: new URL("./packages/reactive-dom/src/index.ts", import.meta.url).pathname,
      },
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
