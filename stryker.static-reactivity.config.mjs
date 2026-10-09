import { createStrykerConfig } from "./stryker.base.config.mjs";

// This bounded profile covers the closed-route proof and the effect import it controls.
export default {
  ...createStrykerConfig({
    name: "static-reactivity",
    breakThreshold: 80,
    mutate: [
      "packages/compiler/src/static-reactivity.ts",
      "packages/router/src/client.ts:3873-3879",
    ],
    testFiles: [
      "packages/compiler/test/static-reactivity.test.ts",
      "packages/router/test/route-client-capabilities.test.ts",
    ],
  }),
  incremental: false,
};
