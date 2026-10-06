import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "performance-compat",
  breakThreshold: 90,
  mutate: [
    "packages/react-compat/src/fiber-child.ts:24-25",
    "packages/react-compat/src/fiber-child.ts:311-331",
    "packages/react-compat/src/fiber-commit.ts:33-33",
    "packages/react-compat/src/fiber-commit.ts:208-208",
    "packages/react-compat/src/fiber-commit.ts:214-214",
    "packages/react-compat/src/fiber-commit.ts:227-248",
  ],
  testFiles: [
    "packages/react-compat/test/deletion-registration.test.ts",
    "packages/react-compat/test/ref-cleanup-performance.test.ts",
    "packages/react-compat/test/fiber-concurrent.test.ts",
    "packages/react-compat/test/keyed-children-general.test.ts",
  ],
});
