import { mkdir, writeFile } from "node:fs/promises";
import { buildNavigationRuntimeBundle } from "./packages/router/dist/client.js";
import { createStrykerConfig } from "./stryker.base.config.mjs";

// Mutate the emitted executable runtime, rather than replacing an entire source template.
const { code } = await buildNavigationRuntimeBundle({ minify: false });
const generated = "coverage/mutation-src/navigation-runtime.js";
await mkdir("coverage/mutation-src", { recursive: true });
await writeFile(generated, code);
const lines = code.split("\n");
function bounds(name) {
  const start = lines.findIndex((line) => line.startsWith(`function ${name}(`) || line.startsWith(`async function ${name}(`));
  if (start < 0) throw new Error(`Generated runtime is missing ${name}`);
  let end = start + 1;
  while (end < lines.length && lines[end] !== "}") end++;
  return { start, end };
}
const mutate = [];
function span(name, first, last) {
  const { start, end } = bounds(name);
  const begin = first === undefined ? start : lines.findIndex((line, index) => index > start && index < end && line.includes(first));
  const finish = last === undefined ? end : lines.findIndex((line, index) => index >= begin && index < end && line.includes(last));
  if (begin < 0 || finish < begin) throw new Error(`Missing mutation boundary in ${name}`);
  mutate.push(`${generated}:${begin + 1}-${finish + 1}`);
}
function statements(name, markers) {
  const { start, end } = bounds(name);
  for (const marker of markers) {
    const matches = lines.flatMap((line, index) => index > start && index < end && line.includes(marker) ? [index] : []);
    if (matches.length === 0) throw new Error(`Missing mutation statement ${name}: ${marker}`);
    for (const index of matches) mutate.push(`${generated}:${index + 1}-${index + 1}`);
  }
}
// Scope the new ownership, byte accounting and template hand-off statements. Existing
// replace/scroll/refetch policy is covered by its own suites rather than this profile.
span("__mreactNavigateToHtml", "if (operation ===", "const applied =");
statements("__mreactNavigateToHtml", ["if (__mreactNavigationState.operation !== operation)"]);
span("__mreactNavigate", "if (operation ===", "__mreactNavigationState.pendingTraversalState = operation");
span("__mreactNavigate", "try {");
span("__mreactApplyNavigationHtmlWithOptionalTransition");
span("__mreactRememberNavigationHtml", "__mreactDeleteCachedNavigationHtml(href)", "while (");
span("__mreactRememberNavigationHtml", "__mreactDeleteCachedNavigationHtml(oldestHref)");
span("__mreactDeleteCachedNavigationHtml");
statements("__mreactResolveNavigationHtml", ["if (operation !==", 'return typeof result.html === "string"']);
statements("__mreactRestoreHistoryState", ["if (operation !==", "if (operation ==="]);
span("__mreactTraverseHistory", "if (traversal ===", "const restored =");
statements("__mreactFinishHistoryTraversal", ['restored === "superseded"']);
statements("__mreactRestoreHistoryEntry", ["const superseded =", 'if (superseded()) return "superseded"']);
statements("__mreactApplyNavigationHtml", ["const template = response", "if (response !=="]);
statements("__mreactFetchNavigationHtml", ["const template = typeof document"]);
statements("__mreactInvalidateAllNavigationCache", ["__mreactNavigationState.cacheBytes ="]);
statements("__mreactInstallNavigation", ["if (!navigated &&", "if (__mreactNavigationState.operation === operation)"]);
for (const prefix of ["__mreactNavigationHtmlCacheMaxBytes =", "__mreactNavigationHtmlCacheMaxEntryBytes ="]) {
  const index = lines.findIndex((line) => line.includes(prefix));
  if (index < 0) throw new Error(`Missing byte budget ${prefix}`);
  mutate.push(`${generated}:${index + 1}-${index + 1}`);
}
process.env.MREACT_REVIEW_MUTATION = "1";
const config = createStrykerConfig({
  name: "performance-client",
  mutate,
  testFiles: ["packages/router/test/navigation-performance-review.test.ts"],
});
config.ignoreStatic = false;
config.incremental = false;
config.ignorePatterns = ["**", ...[
  "packages/**/src/**", "packages/**/dist/**", "packages/*/package.json",
  "packages/router/test/navigation-performance-review.test.ts",
  "scripts/vitest-setup-tmpdir.ts", "vitest.config.ts", "package.json", "pnpm-workspace.yaml", generated,
].map((pattern) => `!${pattern}`)];
delete config.testFiles;
config.vitest = { ...config.vitest, related: false, configFile: "vitest.performance-client.config.ts" };
config.ignorePatterns.push("!vitest.performance-client.config.ts");
export default config;
