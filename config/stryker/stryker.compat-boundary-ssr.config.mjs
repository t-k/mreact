import { createStrykerConfig } from "./stryker.base.config.mjs";

// Eligibility entry, marker ownership, and idempotent root cleanup are the boundary's guards.
export default createStrykerConfig({
  name: "compat-boundary-ssr",
  mutate: [
    "packages/router/src/compat-ssr.ts:56-80",
    "packages/react-compat/src/hydration.ts:83-135",
    "packages/react-compat/src/root.ts:394-414",
  ],
  testFiles: [
    "packages/router/test/compat-ssr-eligibility.test.ts",
    "packages/react-compat/test/sibling-range-hydration.test.ts",
    "packages/react-compat/test/hydration-deep.test.ts",
  ],
});
