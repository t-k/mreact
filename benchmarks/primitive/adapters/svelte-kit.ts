import { createSimpleDomPrimitiveAdapter } from "./simple-dom.js";

export const svelteKitPrimitiveAdapter = createSimpleDomPrimitiveAdapter({
  name: "svelte-kit",
  packageName: "@sveltejs/kit",
});
