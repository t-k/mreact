import base from "./vitest.config.js";

export default {
  ...base,
  test: { ...base.test, include: ["packages/compiler/test/**/*.test.ts"] },
};
