import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "compiler",
  breakThreshold: 80,
  mutate: [
    "packages/compiler/src/emit-client.ts:773-777",
    "packages/compiler/src/emit-client.ts:810-827",
    "packages/compiler/src/emit-client.ts:1198-1201",
    "packages/compiler/src/emit-server.ts:2718-2727",
    "packages/compiler/src/emit-server-stream.ts:4097-4106",
    "packages/compiler/src/oxc-child-analysis.ts:644-647",
    "packages/compiler/src/oxc-child-analysis.ts:694-695",
    "packages/compiler/src/oxc-render-values.ts:86-90",
    "packages/compiler/src/oxc-render-values.ts:174-174",
    "packages/compiler/src/oxc-render-values.ts:187-208",
    "packages/compiler/src/oxc-render-values.ts:228-233",
    "packages/compiler/src/oxc-render-values.ts:315-325",
    "packages/compiler/src/oxc-render-values.ts:334-334",
    "packages/compiler/src/oxc-render-values.ts:375-386",
    "packages/compiler/src/oxc-render-values.ts:398-409",
    "packages/compiler/src/oxc-render-values.ts:414-426",
    "packages/compiler/src/oxc-render-values.ts:440-457",
    "packages/compiler/src/oxc-render-values.ts:460-510",
    "packages/compiler/src/oxc.ts:1862-1867",
    "packages/compiler/src/oxc.ts:2054-2058",
  ],
  testFiles: ["packages/compiler/test/**/*.test.ts"],
});
