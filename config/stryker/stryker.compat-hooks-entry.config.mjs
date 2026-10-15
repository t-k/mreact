import { createStrykerConfig } from "./stryker.base.config.mjs";

export default {
  ...createStrykerConfig({
    name: "compat-hooks-entry",
    mutate: ["packages/router/src/compat-ssr.ts:10-21", "packages/router/src/compat-ssr.ts:86-104"],
    testFiles: [
      "packages/router/test/compat-ssr-hooks-entry.test.ts",
      "packages/router/test/compat-ssr-eligibility.test.ts",
    ],
  }),
  ignoreStatic: false,
  // Static allowlists must be mutated before module evaluation, not in beforeAll.
  testFiles: [],
  incremental: false,
  vitest: { configFile: "vitest.compat-hooks-entry.config.ts", related: false },
};
