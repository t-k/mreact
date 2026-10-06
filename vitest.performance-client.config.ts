import base from "./vitest.config.js";

export default {
  ...base,
  test: { ...base.test, include: ["packages/router/test/navigation-performance-review.test.ts"] },
};
