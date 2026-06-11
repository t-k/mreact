import { createSimpleSsrAdapter } from "./simple-ssr-adapter.js";

export const angularAdapter = createSimpleSsrAdapter({
  name: "angular",
  packageName: "@angular/core",
  renderer: "html",
});
