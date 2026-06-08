import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { exportStaticApp } from "@reckona/mreact-router/adapters/static";

const outDir = join(process.cwd(), ".mreact");
const exportDir = join(process.cwd(), "dist");
const basePath = normalizeBasePath(process.env.MREACT_DOCS_BASE_PATH ?? "");

await exportStaticApp({
  exportDir,
  outDir,
});

if (basePath !== "") {
  await rewriteHtmlBasePaths(exportDir, basePath);
}

await writeFile(join(exportDir, ".nojekyll"), "");
await mkdir(join(exportDir, "404"), { recursive: true });
await copyFile(join(exportDir, "404", "index.html"), join(exportDir, "404.html"));

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "/") {
    return "";
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/g, "");
}

async function rewriteHtmlBasePaths(directory: string, base: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewriteHtmlBasePaths(path, base);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".html")) {
      continue;
    }

    const html = await readFile(path, "utf8");
    const rewritten = html
      .replaceAll('href="/', `href="${base}/`)
      .replaceAll('src="/', `src="${base}/`);
    if (rewritten !== html) {
      await writeFile(path, rewritten);
    }
  }
}
