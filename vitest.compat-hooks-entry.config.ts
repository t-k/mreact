import base from "./vitest.config.js";

export default {
  ...base,
  test: {
    ...base.test,
    include: [
      "packages/router/test/compat-ssr-hooks-entry.test.ts",
      "packages/router/test/compat-ssr-eligibility.test.ts",
    ],
  },
};
