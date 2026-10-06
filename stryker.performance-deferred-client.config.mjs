import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createStrykerConfig } from "./stryker.base.config.mjs";

const source = await readFile(process.env.MREACT_REVIEW_CLIENT_SOURCE ?? new URL("./packages/router/src/client.ts", import.meta.url), "utf8");
const template = source.match(/function deferredNavigationRuntimeSource\(\)\s*:\s*string\s*\{\s*return (`[\s\S]*?`)\s*;?\s*\}/);
if (template === null) throw new Error("The actual deferred navigation template was not found");
// Evaluate the source template itself; no navigation logic is reconstructed here.
const code = `const __mreactGlobal = globalThis;\n${new Function(`return ${template[1]};`)()}\nexport { __mreactInstallNavigation, __mreactDeferredHandleClick };\n`;
const generated = "coverage/mutation-src/deferred-navigation-runtime.js";
await mkdir("coverage/mutation-src", { recursive: true });
await writeFile(generated, code);
await writeFile("coverage/mutation-src/deferred-navigation-target.js", "export {};\n");
const lines = code.split("\n");
const mutate = [];
function span(name, first, last) {
  const start = lines.findIndex((line) => line.startsWith(`function ${name}(`) || line.startsWith(`export async function ${name}(`));
  if (start < 0) throw new Error(`Missing generated function ${name}`);
  let end = start + 1;
  while (end < lines.length && lines[end] !== "}") end++;
  const begin = first === undefined ? start : lines.findIndex((line, index) => index > start && index < end && line.includes(first));
  const finish = last === undefined ? end : lines.findIndex((line, index) => index >= begin && index < end && line.includes(last)) - 1;
  if (begin < 0 || finish < begin) throw new Error(`Missing mutation boundary in ${name}`);
  mutate.push(`${generated}:${begin + 1}-${finish + 1}`);
}
span("__mreactBeginDeferredNavigation");
span("__mreactOwnsDeferredNavigation");
span("__mreactDeferredHandleClick", "const operation = __mreactBeginDeferredNavigation();");
span("__mreactInstallNavigation", 'addEventListener("popstate"', 'document.addEventListener("pointerover"');
span("__mreactNavigate");
process.env.MREACT_REVIEW_DEFERRED_MUTATION = "1";
const config = createStrykerConfig({
  name: "performance-deferred-client",
  mutate,
  testFiles: ["packages/router/test/navigation-deferred-performance.test.ts"],
  breakThreshold: 90,
});
config.ignoreStatic = false;
config.incremental = false;
config.ignorePatterns = ["**", ...[
  "packages/router/src/client.ts", "packages/*/package.json",
  "packages/router/test/navigation-deferred-performance.test.ts",
  "scripts/vitest-setup-tmpdir.ts", "vitest.config.ts", "package.json", "pnpm-workspace.yaml",
  generated, "coverage/mutation-src/deferred-navigation-target.js",
].map((pattern) => `!${pattern}`)];
config.vitest.related = false;
export default config;
