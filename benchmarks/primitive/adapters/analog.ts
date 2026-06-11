import { createSimpleDomPrimitiveAdapter } from "./simple-dom.js";

export const analogPrimitiveAdapter = createSimpleDomPrimitiveAdapter({
  name: "analog",
  packageName: "@analogjs/platform",
});
