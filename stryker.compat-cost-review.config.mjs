import { createStrykerConfig } from "./stryker.base.config.mjs";

export default {
  ...createStrykerConfig({
    name: "compat-cost-review",
    mutate: [
      // The emitted-JS parser options and context filename are fixed metadata.
      "packages/compiler/src/compat-import-normalization.ts:1-21",
      "packages/compiler/src/compat-import-normalization.ts:31-167",
      "packages/router/src/compat-ssr.ts:86-97",
      "packages/react-compat/src/hooks.ts:632-633",
      "packages/react-compat/src/hooks.ts:1179-1181",
      "packages/react-compat/src/hooks.ts:1874-1876",
      // Existing scheduler entry guards and retry policy are outside this change.
      "packages/react-compat/src/hooks.ts:2956-2979",
      "packages/react-compat/src/hooks.ts:3010-3010",
      "packages/react-compat/src/hooks.ts:3023-3028",
      "packages/react-compat/src/hooks.ts:3044-3066",
      "size/compat-props-entry.mjs:1-20",
    ],
    testFiles: [],
  }),
  incremental: false,
  vitest: { configFile: "vitest.compat-cost-review.config.ts", related: false },
};
