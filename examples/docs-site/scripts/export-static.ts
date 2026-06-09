import { access, copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { exportStaticApp } from "@reckona/mreact-router/adapters/static";

const outDir = join(process.cwd(), ".mreact");
const exportDir = join(process.cwd(), "dist");
const basePath = normalizeBasePath(process.env.MREACT_DOCS_BASE_PATH ?? "");

await rm(exportDir, { recursive: true, force: true });

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
await copyGeneratedApiReference();

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

async function copyGeneratedApiReference(): Promise<void> {
  const sourceDir = join(process.cwd(), "..", "..", "docs", "api");
  const targetDir = join(exportDir, "api");

  try {
    await access(sourceDir);
  } catch {
    return;
  }

  await rm(targetDir, { recursive: true, force: true });
  await cp(sourceDir, targetDir, { recursive: true });
  await writeGeneratedApiIntegrationStyles(targetDir);
  await postprocessGeneratedApiReference(targetDir);
}

async function writeGeneratedApiIntegrationStyles(apiDir: string): Promise<void> {
  const assetsDir = join(apiDir, "assets");

  await mkdir(assetsDir, { recursive: true });
  await writeFile(join(assetsDir, "docs-api.css"), generatedApiIntegrationCss());
}

async function postprocessGeneratedApiReference(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      await postprocessGeneratedApiReference(path);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".html")) {
      continue;
    }

    await postprocessGeneratedApiHtml(path);
  }
}

async function postprocessGeneratedApiHtml(path: string): Promise<void> {
  const html = await readFile(path, "utf8");

  if (html.includes("data-mreact-docs-api-shell")) {
    return;
  }

  const apiBase = apiBasePath(html);
  const withStyles = html.replace(
    "</head>",
    `<link rel="stylesheet" href="${apiBase}assets/docs-api.css"/></head>`,
  );
  const withShell = withStyles.replace(
    /(<body><script>[\s\S]*?<\/script>)/,
    `$1${generatedApiShell(apiBase)}`,
  );

  if (withShell !== html) {
    await writeFile(path, withShell);
  }
}

function apiBasePath(html: string): string {
  const match = html.match(/data-base="([^"]*)"/);

  return match?.[1] ?? "./";
}

function generatedApiShell(apiBase: string): string {
  const docsRoot = `${apiBase}../`;

  return `<div class="mreact-api-shell" data-mreact-docs-api-shell><a class="mreact-api-brand" href="${docsRoot}">Mreact Docs</a><nav class="mreact-api-nav" aria-label="Documentation"><a href="${docsRoot}reference/api/">API Reference</a><a href="${docsRoot}reference/cli/">Reference</a><a href="${docsRoot}guides/project-structure/">Guides</a><a href="https://github.com/t-k/mreact">GitHub</a></nav></div>`;
}

function generatedApiIntegrationCss(): string {
  return `:root {
  --mreact-docs-bg: oklch(0.985 0.002 106);
  --mreact-docs-bg-soft: oklch(0.949 0.006 75);
  --mreact-docs-text: oklch(0.216 0.006 56);
  --mreact-docs-text-muted: oklch(0.444 0.011 73);
  --mreact-docs-border: oklch(0.9 0.007 75);
  --mreact-docs-brand: oklch(0.47 0.12 52);
  --mreact-docs-brand-strong: oklch(0.4 0.11 41);
  --mreact-docs-accent: oklch(0.77 0.16 70);
  --light-color-background: var(--mreact-docs-bg);
  --light-color-background-secondary: var(--mreact-docs-bg-soft);
  --light-color-background-active: oklch(0.91 0.011 73);
  --light-color-accent: var(--mreact-docs-border);
  --light-color-text: var(--mreact-docs-text);
  --light-color-text-aside: var(--mreact-docs-text-muted);
  --light-color-link: var(--mreact-docs-brand);
  --light-color-focus-outline: var(--mreact-docs-accent);
  --font-size: 1rem;
}

body {
  background: var(--mreact-docs-bg);
  color: var(--mreact-docs-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.65;
}

.mreact-api-shell {
  align-items: center;
  background: color-mix(in oklch, var(--mreact-docs-bg) 94%, transparent);
  border-bottom: 1px solid var(--mreact-docs-border);
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  min-block-size: 3.75rem;
  padding: 0.75rem clamp(1rem, 4vw, 2rem);
  position: sticky;
  top: 0;
  z-index: 50;
}

.mreact-api-brand {
  color: var(--mreact-docs-text);
  font-size: 1.15rem;
  font-weight: 750;
  text-decoration: none;
}

.mreact-api-nav {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.mreact-api-nav a {
  color: var(--mreact-docs-text-muted);
  font-size: 1rem;
  font-weight: 650;
  text-decoration-color: color-mix(in oklch, var(--mreact-docs-brand) 38%, transparent);
  text-underline-offset: 0.18em;
}

.mreact-api-nav a:hover {
  color: var(--mreact-docs-brand-strong);
  text-decoration-color: currentColor;
}

:where(.mreact-api-shell a, .tsd-page-toolbar a, button, input, select):focus-visible {
  outline: 0.18rem solid var(--mreact-docs-accent);
  outline-offset: 0.18rem;
}

.tsd-page-toolbar {
  border-bottom-color: var(--mreact-docs-border);
  top: 3.75rem;
}

.tsd-page-toolbar .title {
  color: var(--mreact-docs-text);
  font-size: 1rem;
}

.container-main {
  max-width: none;
}

.tsd-typography,
.tsd-panel,
.tsd-page-title,
.tsd-signature,
.tsd-comment {
  font-size: 1rem;
}

.tsd-typography a,
.tsd-navigation a {
  color: var(--mreact-docs-brand);
}

.tsd-panel {
  border-color: var(--mreact-docs-border);
}

.tsd-page-title h1,
.tsd-typography h1 {
  color: var(--mreact-docs-text);
  font-size: clamp(2.1rem, 2rem + 1vw, 2.65rem);
  line-height: 1.15;
  text-wrap: balance;
}

.tsd-typography h2 {
  font-size: 1.5rem;
  text-wrap: balance;
}

.tsd-typography h3 {
  font-size: 1.25rem;
  text-wrap: balance;
}

.tsd-typography p,
.tsd-typography li {
  color: var(--mreact-docs-text);
  font-size: 1rem;
  line-height: 1.75;
  text-wrap: pretty;
}

.tsd-signature,
code,
pre {
  font-size: 1rem;
}

@media (max-width: 52rem) {
  .mreact-api-shell {
    align-items: flex-start;
    flex-direction: column;
  }

  .tsd-page-toolbar {
    top: 6.75rem;
  }
}
`;
}
