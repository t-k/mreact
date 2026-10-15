import { createStrykerConfig } from "./stryker.base.config.mjs";

export default {
  ...createStrykerConfig({
    name: "performance-native",
    breakThreshold: 90,
    mutate: [
      "packages/reactive-dom/src/bind-static-keyed-single-node-list.ts:621-650",
      "packages/reactive-dom/src/bind-static-keyed-single-node-list.ts:913-934",
    ],
    testFiles: [
      "packages/reactive-dom/test/bind-static-keyed-single-node-list.test.ts",
      "packages/compiler/test/keyed-property-text-regression.test.ts",
    ],
  }),
  ignorePatterns: ["test-results/**"],
};
