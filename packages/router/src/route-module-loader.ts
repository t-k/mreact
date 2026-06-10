import { createHash } from "node:crypto";
import type { BuiltServerModuleArtifact } from "./build.js";
import type { AppRouterImportPolicy } from "./import-policy.js";

export type BuiltServerModuleOutputLike = NonNullable<BuiltServerModuleArtifact["request"]>;

// Per-request hashText (SHA-256) is one of the hot path's dominant
// costs. Cache hashes for `code` strings we have already seen this
// process (common case: the prepared code is identical across requests
// when the source file is unchanged).
const codeHashCache = new Map<string, string>();
const MAX_CODE_HASH_ENTRIES = 256;

export function memoizedHashText(code: string): string {
  const cached = codeHashCache.get(code);
  if (cached !== undefined) {
    return cached;
  }

  const hash = hashText(code);
  if (codeHashCache.size >= MAX_CODE_HASH_ENTRIES) {
    // Simple LRU eviction: drop the oldest entry (Map keeps insertion order).
    const oldestKey = codeHashCache.keys().next().value;
    if (oldestKey !== undefined) {
      codeHashCache.delete(oldestKey);
    }
  }
  codeHashCache.set(code, hash);
  return hash;
}

export function prebuiltRequestModuleArtifact(
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  file: string,
  source: string,
  kind: "request" | "routeMetadata" = "request",
): BuiltServerModuleOutputLike | undefined {
  const artifact = serverModules?.get(file)?.[kind];

  return artifact !== undefined && artifact.sourceHash === memoizedHashText(source)
    ? artifact
    : undefined;
}

export function prebuiltRouteLoaderModuleArtifact(
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  file: string,
  source: string,
): BuiltServerModuleOutputLike | undefined {
  const artifact = serverModules?.get(file)?.loader;

  return artifact !== undefined && artifact.sourceHash === memoizedHashText(source)
    ? artifact
    : prebuiltRequestModuleArtifact(serverModules, file, source);
}

export function prebuiltServerComponentModuleCode(
  artifact: BuiltServerModuleArtifact["string"] | BuiltServerModuleArtifact["stream"] | undefined,
  code: string,
  codeHash: string,
  options: { serverAwaitHydration?: boolean } = {},
): string | undefined {
  if (artifact === undefined) {
    return undefined;
  }

  if (!prebuiltServerModuleOutputOptionsMatch(artifact, options)) {
    return undefined;
  }

  if (!prebuiltServerModuleOutputMatches(artifact, code, codeHash)) {
    return undefined;
  }

  return artifact.bundleCode;
}

export function prebuiltServerModuleOutputOptionsMatch(
  artifact: NonNullable<BuiltServerModuleArtifact["string"] | BuiltServerModuleArtifact["stream"]>,
  options: { serverAwaitHydration?: boolean },
): boolean {
  return (
    (artifact.metadata?.serverAwaitHydration === true) ===
    (options.serverAwaitHydration === true)
  );
}

export function prebuiltServerModuleOutputMatches(
  artifact: BuiltServerModuleOutputLike,
  code: string,
  codeHash: string,
): boolean {
  return artifact.sourceHash === codeHash || artifact.code === code;
}

export function importPolicyCacheKey(policy: AppRouterImportPolicy | undefined): string {
  if (policy === undefined) {
    return "";
  }

  return JSON.stringify({
    allowedPackages: [...(policy.allowedPackages ?? [])].sort(),
    allowedSourceDirs: [...(policy.allowedSourceDirs ?? [])].sort(),
    projectRoot: policy.projectRoot ?? "",
  });
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
