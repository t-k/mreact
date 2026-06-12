import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@reckona/mreact-devtools",
        replacement: new URL("./packages/devtools/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-auth",
        replacement: new URL("./packages/auth/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-router/native-escape",
        replacement: new URL("./packages/router/src/native-escape.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-router/session",
        replacement: new URL("./packages/router/src/session.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-router/internal/session",
        replacement: new URL("./packages/router/src/session.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-router",
        replacement: new URL("./packages/router/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-vite",
        replacement: new URL("./packages/vite-plugin/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact/jsx-runtime",
        replacement: new URL("./packages/react/src/jsx-runtime.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact/jsx-dev-runtime",
        replacement: new URL("./packages/react/src/jsx-dev-runtime.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact",
        replacement: new URL("./packages/react/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-compiler/internal",
        replacement: new URL("./packages/compiler/src/internal.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-compiler",
        replacement: new URL("./packages/compiler/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-compat/jsx-runtime",
        replacement: new URL("./packages/react-compat/src/jsx-runtime.ts", import.meta.url)
          .pathname,
      },
      {
        find: "@reckona/mreact-compat/jsx-dev-runtime",
        replacement: new URL("./packages/react-compat/src/jsx-dev-runtime.ts", import.meta.url)
          .pathname,
      },
      {
        find: "@reckona/mreact-compat/event-priority",
        replacement: new URL("./packages/react-compat/src/event-priority.ts", import.meta.url)
          .pathname,
      },
      {
        find: "@reckona/mreact-compat/scheduler",
        replacement: new URL("./packages/react-compat/src/scheduler.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-compat/internal",
        replacement: new URL("./packages/react-compat/src/internal.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-compat",
        replacement: new URL("./packages/react-compat/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-server",
        replacement: new URL("./packages/server/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-server/reorder",
        replacement: new URL("./packages/server/src/reorder.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-server/buffer-sink",
        replacement: new URL("./packages/server/src/buffer-sink.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-shared/compiler-contract",
        replacement: new URL("./packages/shared/src/compiler-contract.ts", import.meta.url)
          .pathname,
      },
      {
        find: "@reckona/mreact-shared/html-escape",
        replacement: new URL("./packages/shared/src/html-escape.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-shared/url-safety",
        replacement: new URL("./packages/shared/src/url-safety.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-shared",
        replacement: new URL("./packages/shared/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-reactive-dom",
        replacement: new URL("./packages/reactive-dom/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-reactive-core/testing",
        replacement: new URL("./packages/reactive-core/src/testing.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-reactive-core/runtime-state",
        replacement: new URL(
          "./packages/reactive-core/src/runtime-state-public.ts",
          import.meta.url,
        ).pathname,
      },
      {
        find: "@reckona/mreact-reactive-core/internal",
        replacement: new URL("./packages/reactive-core/src/internal.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-reactive-core",
        replacement: new URL("./packages/reactive-core/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-query",
        replacement: new URL("./packages/query/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-virtual",
        replacement: new URL("./packages/virtual/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@reckona/mreact-test-utils",
        replacement: new URL("./packages/test-utils/src/index.ts", import.meta.url).pathname,
      },
    ],
  },
  test: {
    environment: "node",
    include: [
      "packages/*/test/**/*.test.ts",
      "scripts/**/*.test.ts",
      "size/**/*.test.ts",
      "benchmarks/**/*.test.ts",
      "examples/**/*.test.ts",
    ],
  },
});
