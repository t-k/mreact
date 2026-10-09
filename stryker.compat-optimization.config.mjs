import { createStrykerConfig } from "./stryker.base.config.mjs";

export default {
  ...createStrykerConfig({
    name: "compat-optimization",
    breakThreshold: 90,
    mutate: [
      // Parser filename/options are fixed metadata for already-emitted JavaScript.
      // Keep all normalization decisions and AST traversal in the mutation scope.
      "packages/compiler/src/compat-import-normalization.ts:1-17",
      "packages/compiler/src/compat-import-normalization.ts:19-122",
      "packages/react-compat/src/hooks.ts:483-483",
      "packages/react-compat/src/hooks.ts:544-548",
      "packages/react-compat/src/hooks.ts:729-731",
      "packages/react-compat/src/hooks.ts:752-756",
      "packages/react-compat/src/hooks.ts:2573-2573",
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
