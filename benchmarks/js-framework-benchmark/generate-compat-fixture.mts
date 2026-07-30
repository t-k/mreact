import { readFile, writeFile } from "node:fs/promises";
import { formatDiagnostic, transform } from "../../packages/compiler/src/index.js";

const sourceUrl = new URL("./frameworks/keyed/mreact-react-compat/src/main.tsx", import.meta.url);
const outputUrl = new URL("./frameworks/keyed/mreact-react-compat/src/main.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const output = transform({
  code: source,
  filename: "main.tsx",
  target: "client",
  dev: false,
  mode: "compat",
});
const errors = output.diagnostics.filter((diagnostic) => diagnostic.level === "error");

if (errors.length > 0) {
  throw new Error(errors.map((diagnostic) => formatDiagnostic("main.tsx", diagnostic)).join("\n"));
}

const header = [
  "// GENERATED from main.tsx by the mreact compiler in production compat mode.",
  "// Source of truth is main.tsx; run pnpm bench:js-framework:generate-compat after compiler changes.",
  "",
].join("\n");

await writeFile(outputUrl, `${header}${output.code.trim()}\n`);
