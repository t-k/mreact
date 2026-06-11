import { createSimpleSsrAdapter } from "./simple-ssr-adapter.js";

export const svelteKitAdapter = createSimpleSsrAdapter({
  clientRuntimeFiles: ["src/runtime/client/client.js", "src/runtime/client/entry.js"],
  name: "svelte-kit",
  packageName: "@sveltejs/kit",
  renderer: "svelte",
});
