import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "request-state",
  breakThreshold: 90,
  mutate: ["packages/reactive-core/src/request-state.ts", "packages/router/src/request-state.ts"],
  testFiles: [
    "packages/reactive-core/test/request-state.test.ts",
    "packages/reactive-core/test/request-state-browser.test.ts",
    "packages/router/test/request-state.test.ts",
  ],
});
