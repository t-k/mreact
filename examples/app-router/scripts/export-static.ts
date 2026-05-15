// Static export using @reckona/mreact-router/adapters/static.
//
// Walks the build manifest's `prerenderedRoutes`, writes one HTML file
// per route into `dist/`, and copies the client bundle alongside. The
// result is a fully static directory you can drop into a CDN bucket.
//
// Prereq: `pnpm build` (so the prerendered manifest exists).
// Run:    `pnpm export:static`           — exports every prerendered route.
//         `pnpm export:static /about /users/ada` — only those paths.
import { resolve } from "node:path";
import { exportStaticApp } from "@reckona/mreact-router/adapters/static";

const outDir = resolve("./.mreact");
const exportDir = resolve("./dist");
const paths = process.argv.slice(2);

const { routes } = await exportStaticApp({
  outDir,
  exportDir,
  ...(paths.length > 0 ? { paths } : {}),
});

console.log(`Wrote ${routes.length} prerendered route(s) under ${exportDir}/`);
for (const route of routes) {
  console.log(`  ${route}`);
}
console.log("Client bundle copied to dist/_mreact/client/.");
