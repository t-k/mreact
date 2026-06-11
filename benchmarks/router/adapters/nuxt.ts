import { createSimpleSsrAdapter } from "./simple-ssr-adapter.js";

export const nuxtAdapter = createSimpleSsrAdapter({
  clientRuntimeFiles: ["dist/index.mjs"],
  name: "nuxt",
  packageName: "nuxt",
  renderer: "vue",
});
