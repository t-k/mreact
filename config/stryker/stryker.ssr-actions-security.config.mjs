import { createStrykerConfig } from "./stryker.base.config.mjs";

export default {
  ...createStrykerConfig({
    name: "ssr-actions-security",
    mutate: [
      "packages/shared/src/html-elements.ts:1-9",
      "packages/react-dom/src/server.ts:97-99",
      "packages/server/src/server-action-error.ts",
      "packages/server/src/flight.ts:628-666",
      "packages/server/src/flight.ts:673-682",
      "packages/server/src/flight.ts:690-692",
      "packages/router/src/actions.ts:507-509",
      "packages/router/src/actions.ts:605-607",
      "packages/router/src/actions.ts:636-650",
      "packages/router/src/actions.ts:658-658",
      "packages/router/src/actions.ts:891-910",
    ],
    testFiles: [
      "packages/shared/test/html-elements-security.test.ts",
      "packages/react-dom/test/server-security.test.ts",
      "packages/react-compat/test/ssr-tag-security.test.ts",
      "packages/server/test/server-action-security.test.ts",
      "packages/server/test/server-action-validation.test.ts",
      "packages/router/test/server-action-errors.test.ts",
      "packages/router/test/server-actions.test.ts",
    ],
  }),
  incremental: false,
};
