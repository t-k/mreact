import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "navigation-route-data",
  mutate: ["packages/router/src/navigation-route-data.ts"],
  testFiles: ["packages/router/test/navigation-route-data.test.ts"],
});
