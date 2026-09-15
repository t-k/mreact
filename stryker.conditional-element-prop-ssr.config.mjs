import { createStrykerConfig } from "./stryker.base.config.mjs";

const config = createStrykerConfig({
  name: "conditional-element-prop-ssr",
  breakThreshold: 100,
  mutate: [
    "packages/compiler/src/emit-server.ts:396-398",
    "packages/compiler/src/emit-server.ts:2774-2779",
    "packages/compiler/src/emit-server.ts:2789-2794",
    "packages/compiler/src/emit-server-stream.ts:417-423",
    "packages/compiler/src/emit-server-stream.ts:4132-4141",
    "packages/compiler/src/emit-server-stream.ts:4165-4174",
  ],
  testFiles: ["packages/compiler/test/server-emit-shared.test.ts"],
});

export default { ...config, incremental: false };
