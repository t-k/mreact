import { createStrykerConfig } from "./stryker.base.config.mjs";

// Regression profile for native component setup and SSR children transfer.
export default createStrykerConfig({
  name: "component-children",
  breakThreshold: 80,
  mutate: [
    "packages/compiler/src/emit-client.ts:264-274",
    "packages/compiler/src/emit-client.ts:1990-1991",
    "packages/compiler/src/emit-server.ts:2827-2827",
    "packages/compiler/src/emit-server.ts:2955-2963",
    "packages/compiler/src/emit-server-stream.ts:1516-1517",
    "packages/compiler/src/emit-server-stream.ts:1524-1531",
    "packages/compiler/src/emit-server-stream.ts:4156-4156",
  ],
  testFiles: [
    "packages/compiler/test/component-body-tracking.test.ts",
    "packages/compiler/test/server-emit-shared.test.ts",
    "packages/compiler/test/runtime-smoke.test.ts",
    "packages/compiler/test/server-transform.test.ts",
    "packages/compiler/test/server-stream-transform.test.ts",
  ],
});
