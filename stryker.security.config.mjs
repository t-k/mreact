import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "security",
  mutate: [
    "packages/shared/src/url-safety.ts",
    "packages/router/src/csp.ts",
    "packages/router/src/cookies.ts",
  ],
  testFiles: [
    "packages/shared/test/url-safety.test.ts",
    "packages/shared/test/url-safety.property.test.ts",
    "packages/router/test/csp.test.ts",
    "packages/router/test/csp.property.test.ts",
    "packages/router/test/cookies.test.ts",
    "packages/router/test/cookies.property.test.ts",
  ],
});
