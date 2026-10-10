import { createStrykerConfig } from "./stryker.base.config.mjs";

export default {
  ...createStrykerConfig({
    name: "compat-optimization",
    breakThreshold: 90,
    mutate: [
      // Parser filename/options are fixed metadata for already-emitted JavaScript.
      // Keep all normalization decisions and AST traversal in the mutation scope.
      "packages/compiler/src/compat-import-normalization.ts:1-21",
      "packages/compiler/src/compat-import-normalization.ts:31-143",
      "packages/react-compat/src/hooks.ts:486-486",
      "packages/react-compat/src/hooks.ts:547-551",
      "packages/react-compat/src/hooks.ts:734-736",
      "packages/react-compat/src/hooks.ts:757-761",
      "packages/react-compat/src/hooks.ts:2578-2578",
    ],
    testFiles: [
      "packages/compiler/test/compat-import-normalization.test.ts",
      "packages/compiler/test/compat-transform.test.ts",
      "packages/react-compat/test/render-attempt-allocation.test.ts",
      "packages/react-compat/test/hooks-effect.test.ts",
      "packages/react-compat/test/common-api.test.ts",
      "packages/react-compat/test/react-official-conformance.test.ts",
    ],
  }),
  incremental: false,
};
