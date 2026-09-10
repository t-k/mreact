import { createStrykerConfig } from "./stryker.base.config.mjs";

// Review regressions: ReactNode strings, consumed range anchors, and per-ref teardown errors.
export default createStrykerConfig({
  name: "compat-ssr-review",
  mutate: [
    "packages/react-compat/src/server-render.ts:68-69",
    "packages/react-compat/src/host-reconciler.ts:367-372",
    "packages/react-compat/src/fiber-commit.ts:58-66",
    "packages/react-compat/src/root.ts:417-418",
    "packages/react-compat/src/root.ts:425-425",
    "packages/react-compat/src/root.ts:438-443",
    "packages/react-compat/src/root.ts:468-475",
  ],
  testFiles: [
    "packages/react-compat/test/server-string-results.test.ts",
    "packages/react-compat/test/sibling-range-hydration.test.ts",
    "packages/react-compat/test/hydration-deep.test.ts",
  ],
});
