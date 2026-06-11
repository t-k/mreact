import { createSimpleSsrAdapter } from "./simple-ssr-adapter.js";

export const vueAdapter = createSimpleSsrAdapter({
  name: "vue",
  packageName: "vue",
  renderer: "vue",
});
