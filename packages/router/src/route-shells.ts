import { dirname, join, relative } from "node:path";

export type RouteShellKind = "layout" | "template";

export interface RouteShellCandidate {
  directory: string;
  file: string;
  kind: RouteShellKind;
}

const routeShellFiles = [
  ["layout.tsx", "layout"],
  ["layout.mreact.tsx", "layout"],
  ["template.tsx", "template"],
  ["template.mreact.tsx", "template"],
] as const satisfies readonly (readonly [string, RouteShellKind])[];

export function routeShellCandidates(rootDir: string, pageFile: string): RouteShellCandidate[] {
  const relativeDir = relative(rootDir, dirname(pageFile));
  const parts = relativeDir === "" ? [] : relativeDir.split(/[\\/]/);
  const directories = [rootDir];

  for (let index = 0; index < parts.length; index += 1) {
    directories.push(join(rootDir, ...parts.slice(0, index + 1)));
  }

  return directories.flatMap((directory) =>
    routeShellFiles.map(([filename, kind]) => ({
      directory,
      file: join(directory, filename),
      kind,
    }))
  );
}

export async function existingRouteShellCandidates(
  rootDir: string,
  pageFile: string,
  exists: (file: string) => Promise<boolean>,
): Promise<RouteShellCandidate[]> {
  const candidates = routeShellCandidates(rootDir, pageFile);
  const existing = await Promise.all(candidates.map(async (candidate) =>
    await exists(candidate.file) ? candidate : undefined
  ));

  return existing.filter((candidate): candidate is RouteShellCandidate => candidate !== undefined);
}
