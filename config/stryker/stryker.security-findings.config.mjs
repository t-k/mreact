import { createStrykerConfig } from "./stryker.base.config.mjs";

export default {
  ...createStrykerConfig({
    name: "security-findings",
    mutate: [
      "packages/router/src/static-middleware-config.ts:21-95",
      "packages/react-compat/src/flight-parser.ts:141-147",
      "packages/react-compat/src/flight-parser.ts:833-839",
      "packages/compiler/src/oxc-render-values.ts:1188-1194",
      "packages/reactive-dom/src/dom-prop-application.ts:31-33",
      "packages/reactive-dom/src/dom-prop-application.ts:118-120",
      "packages/router/src/adapters/cloudflare.ts:904-928",
    ],
    testFiles: [
      "packages/router/test/middleware.test.ts",
      "packages/router/test/cloudflare-adapter.test.ts",
      "packages/react-compat/test/flight.test.ts",
      "packages/compiler/test/named-prop-security.test.ts",
      "packages/compiler/test/oxc-internals.test.ts",
      "packages/reactive-dom/test/dom-prop-application.test.ts",
    ],
  }),
  incremental: false,
};
