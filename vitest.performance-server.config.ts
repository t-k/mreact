import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: [
      "packages/router/test/cache-unit.test.ts",
      "packages/router/test/cache-performance.test.ts",
      "packages/router/test/built-assets.test.ts",
      "packages/router/test/built-performance.test.ts",
    ],
  },
});
