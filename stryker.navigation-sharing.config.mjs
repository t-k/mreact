import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "navigation-sharing",
  mutate: [
    // Mutate the dedicated navigation entry wiring: the batch option, the shared-runtime
    // decision, and the manifest lookup. The unchanged standalone timing path stays out.
    "packages/router/src/build.ts:6864-6878",
    "packages/router/src/build.ts:6890-6890",
    "packages/router/src/build.ts:7006-7008",
    "packages/router/src/client.ts:2880-2880",
    "packages/router/src/client.ts:3023-3033",
    "packages/router/src/client.ts:3042-3043",
    "packages/router/src/client.ts:3051-3051",
    "packages/router/src/bundle-pipeline.ts:650-658",
    "size/delivery.ts:424-424",
  ],
  testFiles: ["packages/router/test/navigation-shared-runtime.test.ts", "size/delivery.test.ts"],
});
