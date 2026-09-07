import { createStrykerConfig } from "./stryker.base.config.mjs";

// Client payload accounting and the disabled client devtools stub. The generic core, compiler and
// lifecycle profiles mutate nothing under size/ and nothing in the client devtools stub, so these
// files need their own bounded profile.
//
// reactive-devtools-stub.ts reports n/a here: its whole body is one static top-level initializer,
// which `ignoreStatic` skips because Stryker cannot activate a mutant that is evaluated at module
// import time. Forcing `ignoreStatic: false` yields one mutant that always survives for the same
// reason. Its behavioural coverage is packages/router/test/reactive-devtools-stub.test.ts, which
// fails on 5 of 6 scenarios when the stub source is emptied and on 2 when the shared handle is
// reverted to a per-call allocation.
export default createStrykerConfig({
  name: "size",
  breakThreshold: 80,
  mutate: [
    "size/compression.ts",
    "size/delivery.ts",
    "size/client-delivery-report.ts",
    "packages/router/src/reactive-devtools-stub.ts",
  ],
  testFiles: [
    "size/delivery.test.ts",
    "size/client-delivery.test.ts",
    "packages/router/test/reactive-devtools-stub.test.ts",
  ],
});
