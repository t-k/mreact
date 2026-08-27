import { createStrykerConfig } from "./stryker.base.config.mjs";

export default createStrykerConfig({
  name: "core",
  mutate: [
    "packages/shared/src/html-escape.ts",
    "packages/virtual/src/index.ts",
    "packages/react-compat/src/scheduler-heap.ts",
    "packages/router/src/client-manifest-assets.ts",
  ],
  testFiles: [
    "packages/shared/test/html-escape.test.ts",
    "packages/virtual/test/virtual-range.test.ts",
    "packages/react-compat/test/scheduler-heap.test.ts",
    "packages/react-compat/test/scheduler-heap.property.test.ts",
    "packages/router/test/client-manifest-assets.test.ts",
    "packages/router/test/client-manifest-assets.property.test.ts",
  ],
});
