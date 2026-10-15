import { createStrykerConfig } from "./stryker.base.config.mjs";

export default {
  ...createStrykerConfig({
    name: "server-only-attribute",
    breakThreshold: 80,
    mutate: ["packages/compiler/src/server-only-attribute.ts"],
    testFiles: [
      "packages/compiler/test/server-only-attribute.test.ts",
      "packages/router/test/route-shared-hydration-runtime.test.ts",
    ],
  }),
  incremental: false,
};
