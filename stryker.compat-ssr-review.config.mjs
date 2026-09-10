import { createStrykerConfig } from "./stryker.base.config.mjs";

// Review regressions: ReactNode strings, consumed range anchors, and per-ref teardown errors.
export default createStrykerConfig({
  name: "compat-ssr-review",
  mutate: [
    "packages/react-compat/src/server-render.ts:68-70",
    "packages/react-compat/src/host-reconciler.ts:361-375",
    "packages/react-compat/src/fiber-commit.ts:57-70",
    "packages/react-compat/src/root.ts:417-418",
    "packages/react-compat/src/root.ts:429-430",
    "packages/react-compat/src/root.ts:444-449",
    "packages/react-compat/src/root.ts:473-478",
  ],
  testFiles: [
    "packages/react-compat/test/server-string-results.test.ts",
    "packages/react-compat/test/sibling-range-hydration.test.ts",
    "packages/react-compat/test/hydration-deep.test.ts",
  ],
});
