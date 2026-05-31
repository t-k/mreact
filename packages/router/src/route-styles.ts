import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { collectStaticImportReferences } from "@reckona/mreact-compiler";
import { existingRouteShellCandidates } from "./route-shells.js";

export async function collectRouteCssFiles(options: {
  appDir: string;
  pageFile: string;
  projectRoot: string;
}): Promise<string[]> {
  return await collectRouteCssFilesFromSources({
    ...options,
    readSource: (file) => readFile(file, "utf8"),
  });
}

export async function collectRouteCssFilesFromSources(options: {
  appDir: string;
  pageFile: string;
  projectRoot: string;
  readSource: (file: string) => Promise<string | undefined> | string | undefined;
}): Promise<string[]> {
  const shellFiles = (await existingRouteShellCandidates(options.appDir, options.pageFile, isFile))
    .map((candidate) => candidate.file);
  const files = [...shellFiles, options.pageFile];
  const seen = new Set<string>();
  const cssFiles: string[] = [];

  for (const file of files) {
    const source = await options.readSource(file);

    if (source === undefined) {
      continue;
    }

    for (const reference of collectStaticImportReferences({ code: source, filename: file })) {
      const cssFile = resolveCssImport({
        importer: file,
        projectRoot: options.projectRoot,
        source: reference.source,
      });

      if (cssFile === undefined || seen.has(cssFile)) {
        continue;
      }

      seen.add(cssFile);
      cssFiles.push(cssFile);
    }
  }

  return cssFiles;
}

export async function collectRouteCssHrefs(options: {
  appDir: string;
  hrefPrefix?: string | undefined;
  pageFile: string;
  projectRoot: string;
}): Promise<string[]> {
  return (await collectRouteCssFiles(options)).map((file) => {
    const href = `/${relative(options.projectRoot, file).split(sep).join("/")}`;

    return options.hrefPrefix === undefined ? href : `${options.hrefPrefix}${href.slice(1)}`;
  });
}

function resolveCssImport(options: {
  importer: string;
  projectRoot: string;
  source: string;
}): string | undefined {
  if (!isCssSource(options.source)) {
    return undefined;
  }

  const resolved = isAbsolute(options.source)
    ? normalizeInsideProject(options.projectRoot, options.source)
    : options.source.startsWith(".")
      ? normalizeInsideProject(options.projectRoot, resolve(dirname(options.importer), options.source))
      : undefined;

  return resolved;
}

function normalizeInsideProject(projectRoot: string, file: string): string | undefined {
  const normalized = resolve(file);
  const root = resolve(projectRoot);
  const relativePath = relative(root, normalized);

  return relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)
    ? undefined
    : normalized;
}

function isCssSource(source: string): boolean {
  return /\.(?:css|pcss|postcss|scss|sass|less|styl|stylus)$/u.test(source);
}

async function isFile(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
