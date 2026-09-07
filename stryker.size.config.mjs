import { createStrykerConfig } from "./stryker.base.config.mjs";

// Delivery accounting and the client delivery budget gate. The generic core/compiler/lifecycle
// profiles do not mutate anything under size/, so these files need their own bounded profile.
export default createStrykerConfig({
  name: "size",
  breakThreshold: 80,
  mutate: ["size/compression.ts", "size/delivery.ts", "size/client-delivery-report.ts"],
  testFiles: ["size/delivery.test.ts", "size/client-delivery.test.ts"],
});
