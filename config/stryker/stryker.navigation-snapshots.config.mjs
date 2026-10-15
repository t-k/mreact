import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "navigation-snapshots",
  breakThreshold: 80,
  mutate: ["packages/router/src/navigation-snapshots.ts"],
  testFiles: ["packages/router/test/navigation-snapshots.test.ts"],
});
