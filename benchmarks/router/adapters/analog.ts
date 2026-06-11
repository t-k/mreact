import { createSimpleSsrAdapter } from "./simple-ssr-adapter.js";

export const analogAdapter = createSimpleSsrAdapter({
  name: "analog",
  packageName: "@analogjs/platform",
  renderer: "html",
});
