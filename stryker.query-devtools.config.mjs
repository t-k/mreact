import { createStrykerConfig } from "./stryker.base.config.mjs";

export default {
  ...createStrykerConfig({
    name: "query-devtools",
    mutate: ["packages/query/src/devtools.ts:4-5", "packages/query/src/devtools.ts:54-58"],
    testFiles: ["packages/query/test/devtools-build-flag.test.ts"],
  }),
  ignoreStatic: false,
  ignorePatterns: [".futaba*/**"],
};
