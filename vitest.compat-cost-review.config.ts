import base from "./vitest.config.js";

export default {
  ...base,
  test: {
    ...base.test,
    include: [
      "size/compat-props-performance.test.ts",
      "packages/compiler/test/compat-import-normalization.test.ts",
      "packages/compiler/test/compat-transform.test.ts",
      "packages/react-compat/test/host-commit-work.test.ts",
      "packages/react-compat/test/hooks-state.test.ts",
      "packages/react-compat/test/hooks-effect.test.ts",
      "packages/react-compat/test/render-attempt-allocation.test.ts",
      "packages/react-compat/test/common-api.test.ts",
      "packages/router/test/compat-ssr-eligibility.test.ts",
      "packages/router/test/compat-ssr-context-proof.test.ts",
      "packages/router/test/compat-ssr-context.test.ts",
      "packages/router/test/compat-ssr-hooks-entry.test.ts",
    ],
  },
};
