import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "navigation-sharing",
  mutate: [
    // Mutate the new preference for the shared entry, not the unchanged standalone timing path.
    "packages/router/src/build.ts:764-764",
    "packages/router/src/build.ts:6849-6871",
    "packages/router/src/build.ts:6880-6880",
    "packages/router/src/build.ts:6996-6998",
    "packages/router/src/client.ts:2869-2869",
    "packages/router/src/client.ts:2902-2902",
    "packages/router/src/bundle-pipeline.ts:650-658",
    "size/delivery.ts:424-424",
  ],
  testFiles: ["packages/router/test/navigation-shared-runtime.test.ts", "size/delivery.test.ts"],
});
