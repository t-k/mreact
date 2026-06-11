import { createSimpleSsrAdapter } from "./simple-ssr-adapter.js";

export const svelteKitAdapter = createSimpleSsrAdapter({
  name: "svelte-kit",
  packageName: "@sveltejs/kit",
  renderer: "svelte",
});
