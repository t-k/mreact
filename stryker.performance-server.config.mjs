import { createStrykerConfig } from "./stryker.base.config.mjs";

export default {
  ...createStrykerConfig({
    name: "performance-server",
    breakThreshold: 90,
    mutate: [
      "packages/router/src/cache.ts:137-233",
      "packages/router/src/built-assets.ts:14-17",
      "packages/router/src/built-assets.ts:63-78",
      "packages/router/src/built-assets.ts:81-122",
      "packages/router/src/built-assets.ts:131-190",
      "packages/router/src/built-runtime.ts:214-214",
      "packages/router/src/build.ts:936-936",
      "packages/router/src/serve.ts:423-424",
      "packages/router/src/serve.ts:439-440",
      "packages/router/src/serve.ts:468-473",
    ],
    // Stryker 9.6.1 activates static mutants at runtime when testFiles is populated.
    // Limit the test suite through Vitest so module-scope limits are mutated before import.
    testFiles: [],
  }),
  concurrency: 1,
  ignoreStatic: false,
  vitest: { configFile: "vitest.performance-server.config.ts", related: false },
};
