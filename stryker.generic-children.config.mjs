import { createStrykerConfig } from "./stryker.base.config.mjs";

// Limit mutation to the single-value transfer boundary in both SSR emitters.
export default createStrykerConfig({
  name: "generic-children",
  breakThreshold: 80,
  mutate: [
    "packages/compiler/src/emit-server.ts:2778-2790",
    "packages/compiler/src/emit-server-stream.ts:4108-4120",
  ],
  testFiles: [
    "packages/compiler/test/generic-ssr-children.test.ts",
    "packages/compiler/test/server-emit-shared.test.ts",
    "packages/compiler/test/server-transform.test.ts",
    "packages/compiler/test/server-stream-transform.test.ts",
  ],
});
