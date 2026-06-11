import { createSimpleSsrAdapter } from "./simple-ssr-adapter.js";

export const vueAdapter = createSimpleSsrAdapter({
  clientRuntimeFiles: ["dist/vue.runtime.esm-browser.prod.js"],
  name: "vue",
  packageName: "vue",
  renderer: "vue",
});
