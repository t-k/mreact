import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "navigation-history",
  mutate: ["packages/router/src/navigation-history-cache.ts"],
  testFiles: ["packages/router/test/navigation-history-cache.test.ts"],
});
