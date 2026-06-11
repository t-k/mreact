import { createSimpleDomPrimitiveAdapter } from "./simple-dom.js";

export const vuePrimitiveAdapter = createSimpleDomPrimitiveAdapter({
  name: "vue",
  packageName: "vue",
});
