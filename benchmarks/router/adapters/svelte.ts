import { createSimpleSsrAdapter } from "./simple-ssr-adapter.js";

export const svelteAdapter = createSimpleSsrAdapter({
  name: "svelte",
  packageName: "svelte",
  renderer: "svelte",
});
