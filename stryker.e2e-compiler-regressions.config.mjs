import { readFileSync } from "node:fs";
import { createStrykerConfig } from "./stryker.base.config.mjs";

const mutate = [];
function span(file, first, last) {
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((line) => line.includes(first));
  const end = lines.findIndex((line, index) => index > start && line.includes(last));
  if (start < 0 || end < start) throw new Error(`Missing mutation range: ${file}: ${first}`);
  mutate.push(`${file}:${start + 1}-${end}`);
}
function statement(file, marker) {
  const lines = readFileSync(file, "utf8").split("\n");
  const matches = lines.flatMap((line, index) => (line.includes(marker) ? [index] : []));
  if (matches.length === 0) throw new Error(`Missing mutation statement: ${file}: ${marker}`);
  for (const index of matches) mutate.push(`${file}:${index + 1}-${index + 1}`);
}
span(
  "packages/compiler/src/emit-server-shared.ts",
  "export function staticTextSeparatedHtml(",
  "const URL_ATTRIBUTE_NAMES",
);
const client = "packages/compiler/src/emit-client.ts";
const server = "packages/compiler/src/emit-server.ts";
const stream = "packages/compiler/src/emit-server-stream.ts";
span(
  client,
  'if (node.namespace !== "svg" && isVoidHtmlElement(node.tagName))',
  "return `<${node.tagName}${attrs}>${children}</${node.tagName}>`",
);
span(server, "function isSimpleTextChild(", "function emitTextSeparatedSimpleChildrenExpression(");
span(
  stream,
  "function collectTextSeparatedChildrenParts(",
  "function collectTextSeparatedSimpleChildrenParts(",
);
statement(server, "currentPreserveMixedTextNodes = options.preserveMixedTextNodes === true");
statement(stream, "currentPreserveMixedTextNodes = options.preserveMixedTextNodes === true");
statement(stream, "emittedServerCode.includes(compatRenderToStringHelperName)");
statement(stream, "hasRawJsxDynamicRender(ir) && usesCompatRenderToString");
statement("packages/compiler/src/transform.ts", 'preserveMixedTextNodes: mode === "compat"');

const config = createStrykerConfig({
  name: "e2e-compiler-regressions",
  mutate,
  testFiles: ["packages/compiler/test/**/*.test.ts"],
});
config.ignoreStatic = false;
config.incremental = false;
config.ignorePatterns = [
  "**",
  ...[
    "packages/**/src/**",
    "packages/**/dist/**",
    "packages/*/package.json",
    "packages/compiler/test/**",
    "examples/selective-hydration/src/App.compat.tsx",
    "benchmarks/js-framework-benchmark/frameworks/keyed/mreact/src/main.tsx",
    "scripts/vitest-setup-tmpdir.ts",
    "vitest.config.ts",
    "vitest.e2e-compiler-regressions.config.ts",
    "package.json",
    "pnpm-workspace.yaml",
  ].map((pattern) => `!${pattern}`),
];
delete config.testFiles;
config.vitest = {
  ...config.vitest,
  related: false,
  configFile: "vitest.e2e-compiler-regressions.config.ts",
};
export default config;
