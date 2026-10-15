import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "router-lifecycle",
  mutate: [
    "benchmarks/router/cleanup.ts",
    "benchmarks/router/run-output.ts",
    "benchmarks/router/temporary-directories.ts",
  ],
  testFiles: [
    "benchmarks/router/cleanup.test.ts",
    "benchmarks/router/run-output.test.ts",
    "benchmarks/router/runner-lifecycle.test.ts",
    "benchmarks/router/temporary-directories.test.ts",
  ],
});
