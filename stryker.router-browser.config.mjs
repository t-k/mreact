import { createStrykerConfig } from "./stryker.base.config.mjs";

const config = {
  ...createStrykerConfig({
    name: "router-browser",
    mutate: ["benchmarks/router/runner-browser.ts"],
    testFiles: [],
  }),
  ignoreStatic: false,
  incremental: false,
  vitest: { configFile: "vitest.router-browser.config.ts", related: false },
};
// Static definitions must be activated before module loading, without a global test filter.
delete config.testFiles;
export default config;
