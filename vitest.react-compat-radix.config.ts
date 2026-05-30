import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "react/jsx-runtime",
        replacement: new URL("./packages/react-compat/src/jsx-runtime.ts", import.meta.url)
          .pathname,
      },
      {
        find: "react/jsx-dev-runtime",
        replacement: new URL("./packages/react-compat/src/jsx-dev-runtime.ts", import.meta.url)
          .pathname,
      },
      {
        find: "react-dom/client",
        replacement: new URL("./packages/react-dom/src/client.ts", import.meta.url).pathname,
      },
      {
        find: "react-dom",
        replacement: new URL("./packages/react-dom/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "react",
        replacement: new URL("./packages/react-compat/src/index.ts", import.meta.url).pathname,
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
    ],
  },
  test: {
    environment: "node",
    include: ["packages/react-compat/test/radix-dialog.compat.ts"],
    server: {
      deps: {
        inline: true,
      },
    },
  },
});
