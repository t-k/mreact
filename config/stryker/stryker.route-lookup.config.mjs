import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "route-lookup",
  breakThreshold: 90,
  mutate: [
    "packages/router/src/static-route-lookup.ts",
    "packages/router/src/routes.ts:189-207",
    "packages/router/src/routes.ts:217-226",
    "packages/router/src/adapters/cloudflare.ts:1586-1616",
  ],
  testFiles: [
    "packages/router/test/static-route-lookup.test.ts",
    "packages/router/test/routes.test.ts",
    "packages/router/test/routes-unit.test.ts",
    "packages/router/test/cloudflare-adapter.test.ts",
  ],
});
