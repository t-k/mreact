import { createStrykerConfig } from "./stryker.base.config.mjs";

export default {
  ...createStrykerConfig({
    name: "compat-context-ssr",
    mutate: [
      "packages/router/src/compat-ssr-context.ts",
      "packages/router/src/compat-ssr.ts:64-270",
    ],
    testFiles: [],
  }),
  ignoreStatic: false,
  incremental: false,
  vitest: { configFile: "vitest.compat-context-ssr.config.ts", related: false },
};
