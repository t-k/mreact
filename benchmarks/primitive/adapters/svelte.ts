import { createSimpleDomPrimitiveAdapter } from "./simple-dom.js";

export const sveltePrimitiveAdapter = createSimpleDomPrimitiveAdapter({
  name: "svelte",
  packageName: "svelte",
});
