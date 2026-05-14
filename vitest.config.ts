import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@modular-react/devtools",
        replacement: new URL("./packages/devtools/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@modular-react/auth",
        replacement: new URL("./packages/auth/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@modular-react/router",
        replacement: new URL("./packages/router/src/index.ts", import.meta.url).pathname,
      },
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
        find: "@modular-react/react-compat/jsx-dev-runtime",
        replacement: new URL("./packages/react-compat/src/jsx-dev-runtime.ts", import.meta.url)
          .pathname,
      },
      {
        find: "@modular-react/react-compat/scheduler",
        replacement: new URL("./packages/react-compat/src/scheduler.ts", import.meta.url).pathname,
      },
      {
        find: "@modular-react/react-compat/internal",
        replacement: new URL("./packages/react-compat/src/internal.ts", import.meta.url).pathname,
      },
      {
        find: "@modular-react/react-compat",
        replacement: new URL("./packages/react-compat/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@modular-react/server",
        replacement: new URL("./packages/server/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@modular-react/server/reorder",
        replacement: new URL("./packages/server/src/reorder.ts", import.meta.url).pathname,
      },
      {
        find: "@modular-react/server/buffer-sink",
        replacement: new URL("./packages/server/src/buffer-sink.ts", import.meta.url).pathname,
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
      {
        find: "@modular-react/query",
        replacement: new URL("./packages/query/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@modular-react/test-utils",
        replacement: new URL("./packages/test-utils/src/index.ts", import.meta.url).pathname,
      },
    ],
  },
  test: {
    environment: "node",
    include: [
      "packages/*/test/**/*.test.ts",
      "size/**/*.test.ts",
      "benchmarks/**/*.test.ts",
      "examples/**/*.test.ts",
    ],
  },
});
