import { createSimpleSsrAdapter } from "./simple-ssr-adapter.js";

export const svelteAdapter = createSimpleSsrAdapter({
  clientRuntimeFiles: ["src/internal/client/index.js"],
  name: "svelte",
  packageName: "svelte",
  renderer: "svelte",
});
