import { createSimpleDomPrimitiveAdapter } from "./simple-dom.js";

export const angularPrimitiveAdapter = createSimpleDomPrimitiveAdapter({
  name: "angular",
  packageName: "@angular/core",
});
