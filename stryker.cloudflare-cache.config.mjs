import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "cloudflare-cache",
  mutate: ["packages/router/src/cache-policy.ts", "packages/router/src/cloudflare-cache.ts"],
  testFiles: [
    "packages/router/test/cloudflare-cache-unit.test.ts",
    "packages/router/test/cloudflare-cache.test.ts",
    "packages/router/test/cache-unit.test.ts",
  ],
});
