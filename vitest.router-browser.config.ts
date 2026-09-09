import base from "./vitest.config.js";

export default {
  ...base,
  test: {
    ...base.test,
    include: ["benchmarks/router/runner-browser.test.ts"],
  },
};
