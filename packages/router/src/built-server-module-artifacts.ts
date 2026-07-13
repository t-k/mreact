import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";
import type { BuiltServerModuleArtifact } from "./build.js";
import { routeShellCandidates } from "./route-shells.js";

export interface BuiltServerModuleArtifactRuntime {
  appDir: string;
  serverModuleArtifactLoads: Map<string, Promise<void>>;
  serverModuleClosureFiles: Map<string, readonly string[]>;
  serverModuleFiles: ReadonlyMap<string, string>;
  serverModuleRenderFiles: ReadonlyMap<string, string>;
  serverModuleRequestFiles: ReadonlyMap<string, string>;
  serverModules: Map<string, BuiltServerModuleArtifact>;
  serverSourceFiles: ReadonlyMap<string, string>;
}

export type BuiltServerModuleArtifactKind = "all" | "render" | "request";

export async function loadBuiltServerModuleArtifacts(
  runtime: BuiltServerModuleArtifactRuntime,
  files: Iterable<string>,
  kind: BuiltServerModuleArtifactKind = "all",
): Promise<void> {
  for (const file of files) {
    await loadBuiltServerModuleArtifact(runtime, file, kind);
  }
}

async function loadBuiltServerModuleArtifact(
  runtime: BuiltServerModuleArtifactRuntime,
  file: string,
  kind: BuiltServerModuleArtifactKind = "all",
): Promise<void> {
  if (kind === "all") {
    await loadBuiltServerModuleArtifact(runtime, file, "request");
    await loadBuiltServerModuleArtifact(runtime, file, "render");
    return;
  }

  const artifactPath =
    kind === "request"
      ? runtime.serverModuleRequestFiles.get(file) ?? runtime.serverModuleFiles.get(file)
      : runtime.serverModuleRenderFiles.get(file) ?? runtime.serverModuleFiles.get(file);

  if (artifactPath === undefined) {
    return;
  }

  const cached = runtime.serverModuleArtifactLoads.get(`${kind}\0${file}`);

  if (cached !== undefined) {
    await cached;
    return;
  }

  const loaded = readFile(artifactPath, "utf8")
    .then((text) => {
      const existing = runtime.serverModules.get(file) ?? {};
      runtime.serverModules.set(
        file,
        mergeBuiltServerModuleArtifacts(
          existing,
          hydrateBuiltServerModuleArtifact(
            parseBuiltJsonArtifact<BuiltServerModuleArtifact>(
              text,
              artifactPath,
              `built server module artifact for ${file}`,
            ),
            builtServerDirForArtifactPath(artifactPath),
          ),
        ),
      );
    })
    .catch((error) => {
      runtime.serverModuleArtifactLoads.delete(`${kind}\0${file}`);
      if (isMissingFileError(error)) {
        throw builtArtifactReadError(`built server module artifact for ${file}`, artifactPath, error);
      }
      throw error;
    });
  runtime.serverModuleArtifactLoads.set(`${kind}\0${file}`, loaded);

  await loaded;
}

export function allBuiltServerModuleFiles(
  runtime: BuiltServerModuleArtifactRuntime,
): Iterable<string> {
  return new Set([
    ...runtime.serverModuleFiles.keys(),
    ...runtime.serverModuleRequestFiles.keys(),
    ...runtime.serverModuleRenderFiles.keys(),
  ]);
}

function builtServerDirForArtifactPath(artifactPath: string): string {
  const marker = `${sep}server-modules${sep}`;
  const index = artifactPath.lastIndexOf(marker);

  return index === -1 ? dirname(dirname(artifactPath)) : artifactPath.slice(0, index);
}

function hydrateBuiltServerModuleArtifact(
  artifact: BuiltServerModuleArtifact,
  serverDir: string,
): BuiltServerModuleArtifact {
  return {
    ...(artifact.analysis === undefined ? {} : { analysis: artifact.analysis }),
    ...(artifact.loader === undefined
      ? {}
      : { loader: hydrateBuiltServerModuleOutput(artifact.loader, serverDir) }),
    ...(artifact.routeMetadata === undefined
      ? {}
      : { routeMetadata: hydrateBuiltServerModuleOutput(artifact.routeMetadata, serverDir) }),
    ...(artifact.request === undefined
      ? {}
      : { request: hydrateBuiltServerModuleOutput(artifact.request, serverDir) }),
    ...(artifact.stream === undefined
      ? {}
      : { stream: hydrateBuiltServerModuleOutput(artifact.stream, serverDir) }),
    ...(artifact.string === undefined
      ? {}
      : { string: hydrateBuiltServerModuleOutput(artifact.string, serverDir) }),
  };
}

function hydrateBuiltServerModuleOutput<T extends { moduleFile?: string | undefined }>(
  output: T,
  serverDir: string,
): T {
  if (output.moduleFile === undefined || isAbsolute(output.moduleFile)) {
    return output;
  }

  return {
    ...output,
    moduleFile: join(serverDir, safeBuiltServerManifestFilePath(output.moduleFile)),
  };
}

function mergeBuiltServerModuleArtifacts(
  existing: BuiltServerModuleArtifact,
  loaded: BuiltServerModuleArtifact,
): BuiltServerModuleArtifact {
  return {
    ...existing,
    ...loaded,
  };
}

export async function loadBuiltServerModuleArtifactsForRequest(
  runtime: BuiltServerModuleArtifactRuntime,
  routeFile: string | undefined,
  options: {
    includeRender?: boolean | undefined;
    includeShells?: boolean | undefined;
  } = {},
): Promise<void> {
  const roots = [
    join(runtime.appDir, "middleware.ts"),
    join(runtime.appDir, "middleware.mreact.ts"),
    ...(routeFile === undefined
      ? []
      : [
          routeFile,
          ...(options.includeShells === false ? [] : shellFilesForRoute(runtime, routeFile)),
        ]),
  ];
  const seen = new Set<string>();

  for (const file of roots) {
    await loadBuiltServerModuleArtifactClosure(runtime, file, seen, "request");
  }

  if (options.includeRender === true) {
    seen.clear();
    for (const file of roots) {
      await loadBuiltServerModuleArtifactClosure(runtime, file, seen, "render");
    }
  }
}

async function loadBuiltServerModuleArtifactClosure(
  runtime: BuiltServerModuleArtifactRuntime,
  file: string,
  seen: Set<string>,
  kind: BuiltServerModuleArtifactKind,
): Promise<void> {
  for (const closureFile of builtServerModuleClosureFiles(runtime, file)) {
    if (seen.has(closureFile)) {
      continue;
    }
    seen.add(closureFile);
    await loadBuiltServerModuleArtifact(runtime, closureFile, kind);
  }
}

function builtServerModuleClosureFiles(
  runtime: BuiltServerModuleArtifactRuntime,
  file: string,
): readonly string[] {
  const cached = runtime.serverModuleClosureFiles.get(file);
  if (cached !== undefined) {
    return cached;
  }

  const closure: string[] = [];
  collectBuiltServerModuleClosureFiles(runtime, file, new Set(), closure);
  runtime.serverModuleClosureFiles.set(file, closure);
  return closure;
}

function collectBuiltServerModuleClosureFiles(
  runtime: BuiltServerModuleArtifactRuntime,
  file: string,
  seen: Set<string>,
  closure: string[],
): void {
  if (seen.has(file)) {
    return;
  }
  seen.add(file);
  closure.push(file);

  const source = runtime.serverSourceFiles.get(file);
  if (source === undefined) {
    return;
  }

  for (const specifier of localServerModuleSpecifiers(source)) {
    const resolved = resolveBuiltLocalServerSourceImport(runtime, file, specifier);
    if (resolved !== undefined) {
      collectBuiltServerModuleClosureFiles(runtime, resolved, seen, closure);
    }
  }
}

const localServerModuleImportPattern =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s*)?["'](?<source>\.{1,2}\/[^"']+)["']/g;

function localServerModuleSpecifiers(code: string): string[] {
  const specifiers = new Set<string>();
  localServerModuleImportPattern.lastIndex = 0;

  for (const match of code.matchAll(localServerModuleImportPattern)) {
    const source = match.groups?.source;

    if (source !== undefined) {
      specifiers.add(source);
    }
  }

  return Array.from(specifiers);
}

function resolveBuiltLocalServerSourceImport(
  runtime: BuiltServerModuleArtifactRuntime,
  fromFile: string,
  specifier: string,
): string | undefined {
  const base = join(dirname(fromFile), specifier);

  for (const candidate of localServerSourceImportCandidates(base)) {
    if (runtime.serverSourceFiles.has(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function localServerSourceImportCandidates(base: string): string[] {
  const candidates = [base];

  if (base.endsWith(".js")) {
    const withoutJs = base.slice(0, -".js".length);
    candidates.push(`${withoutJs}.ts`, `${withoutJs}.tsx`, `${withoutJs}.mreact.tsx`);
  } else if (base.endsWith(".jsx")) {
    const withoutJsx = base.slice(0, -".jsx".length);
    candidates.push(`${withoutJsx}.tsx`, `${withoutJsx}.mreact.tsx`);
  } else if (base.endsWith(".mreact")) {
    candidates.push(`${base}.tsx`);
  } else {
    candidates.push(
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.mreact.tsx`,
      join(base, "index.ts"),
      join(base, "index.tsx"),
      join(base, "index.mreact.tsx"),
    );
  }

  return candidates;
}

function shellFilesForRoute(
  runtime: BuiltServerModuleArtifactRuntime,
  routeFile: string,
): string[] {
  return routeShellCandidates(runtime.appDir, routeFile)
    .map((candidate) => candidate.file)
    .filter((file) => runtime.serverSourceFiles.has(file));
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function builtArtifactReadError(label: string, artifactPath: string, error: unknown): Error {
  const prefix = isMissingFileError(error) ? "Missing" : "Unable to read";
  const detail = error instanceof Error && error.message !== "" ? `: ${error.message}` : "";

  return new Error(`${prefix} ${label}: ${artifactPath}${detail}`, { cause: error });
}

function parseBuiltJsonArtifact<T>(text: string, artifactPath: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const detail = error instanceof Error && error.message !== "" ? `: ${error.message}` : "";

    throw new Error(`Invalid ${label}: ${artifactPath}${detail}`, { cause: error });
  }
}

function safeBuiltServerManifestFilePath(pathname: string): string {
  const normalized = normalize(pathname);

  if (isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Invalid built app manifest file path: ${pathname}`);
  }

  return normalized;
}
