import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "list-rotation",
  breakThreshold: 80,
  mutate: [
    "packages/reactive-dom/src/bind-static-keyed-single-node-list.ts:447-449",
    "packages/reactive-dom/src/bind-static-keyed-single-node-list.ts:1725-1760",
  ],
  testFiles: ["packages/reactive-dom/test/bind-static-keyed-single-node-list.test.ts"],
});
