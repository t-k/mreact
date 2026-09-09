import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "keyed-refresh",
  mutate: [
    "packages/reactive-dom/src/bind-static-keyed-single-node-list.ts:1172-1175",
    "packages/reactive-dom/src/bind-static-keyed-single-node-list.ts:1198-1208",
    "packages/reactive-dom/src/bind-static-keyed-single-node-list.ts:1391-1394",
  ],
  testFiles: [
    "packages/reactive-dom/test/compiler-keyed-property-refresh.test.ts",
    "packages/reactive-dom/test/bind-static-keyed-single-node-list.test.ts",
  ],
});
