import { createSimpleSsrAdapter } from "./simple-ssr-adapter.js";

export const analogAdapter = createSimpleSsrAdapter({
  clientRuntimeFiles: ["src/index.js"],
  name: "analog",
  packageName: "@analogjs/platform",
  renderer: "html",
});
