/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  clearTextReporter: {
    allowEmojis: false,
  },
  concurrency: 2,
  coverageAnalysis: "perTest",
  htmlReporter: {
    fileName: "coverage/mutation/html/index.html",
  },
  jsonReporter: {
    fileName: "coverage/mutation/mutation.json",
  },
  ignoreStatic: true,
  mutate: ["packages/shared/src/html-escape.ts"],
  packageManager: "pnpm",
  plugins: ["@stryker-mutator/vitest-runner"],
  reporters: ["clear-text", "progress", "html", "json"],
  testFiles: ["packages/shared/test/html-escape.test.ts"],
  testRunner: "vitest",
  thresholds: {
    break: 90,
    high: 90,
    low: 80,
  },
  vitest: {
    configFile: "vitest.config.ts",
    related: true,
  },
};

export default config;
