import { createSimpleSsrAdapter } from "./simple-ssr-adapter.js";

export const nuxtAdapter = createSimpleSsrAdapter({
  name: "nuxt",
  packageName: "nuxt",
  renderer: "vue",
});
