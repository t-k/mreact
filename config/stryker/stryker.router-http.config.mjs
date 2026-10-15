import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "router-http",
  mutate: ["benchmarks/router/http-trial-types.ts", "benchmarks/router/runner-http.ts"],
  testFiles: [
    "benchmarks/router/http-trial-types.test.ts",
    "benchmarks/router/runner-http.test.ts",
    "benchmarks/router/http-trials.test.ts",
  ],
});
