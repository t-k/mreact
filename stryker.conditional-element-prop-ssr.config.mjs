import { createStrykerConfig } from "./stryker.base.config.mjs";

const config = createStrykerConfig({
  name: "conditional-element-prop-ssr",
  breakThreshold: 100,
  mutate: [
    "packages/compiler/src/emit-server.ts:397-398",
    "packages/compiler/src/emit-server.ts:2776-2781",
    "packages/compiler/src/emit-server.ts:2791-2796",
    "packages/compiler/src/emit-server.ts:3010-3015",
    "packages/compiler/src/emit-server-stream.ts:418-423",
    "packages/compiler/src/emit-server-stream.ts:4132-4141",
    "packages/compiler/src/emit-server-stream.ts:4165-4174",
  ],
  testFiles: ["packages/compiler/test/server-emit-shared.test.ts"],
});

export default { ...config, incremental: false };
