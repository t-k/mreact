import { createSimpleDomPrimitiveAdapter } from "./simple-dom.js";

export const nuxtPrimitiveAdapter = createSimpleDomPrimitiveAdapter({
  name: "nuxt",
  packageName: "nuxt",
});
