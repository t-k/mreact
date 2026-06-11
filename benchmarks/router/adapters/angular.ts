import { createSimpleSsrAdapter } from "./simple-ssr-adapter.js";

export const angularAdapter = createSimpleSsrAdapter({
  clientRuntimeFiles: ["fesm2022/core.mjs"],
  name: "angular",
  packageName: "@angular/core",
  renderer: "html",
});
