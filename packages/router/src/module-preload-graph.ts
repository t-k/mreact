export interface StaticModuleChunk {
  imports?: readonly string[] | undefined;
}

export function collectStaticModulePreloadDependencies(
  entryFile: string,
  chunks: ReadonlyMap<string, StaticModuleChunk>,
): string[] {
  if (!chunks.has(entryFile)) {
    throw new Error(`Missing static JavaScript chunk for module preload entry: ${entryFile}`);
  }

  const dependencies = new Set<string>();
  const visited = new Set<string>();
  const pending = [...(chunks.get(entryFile)?.imports ?? [])];

  while (pending.length > 0) {
    const path = pending.pop();

    if (
      path === undefined ||
      path === entryFile ||
      visited.has(path) ||
      !isLocalJavaScriptChunk(path)
    ) {
      continue;
    }

    visited.add(path);
    const chunk = chunks.get(path);

    if (chunk === undefined) {
      throw new Error(`Missing static JavaScript chunk for module preload: ${path}`);
    }

    dependencies.add(path);
    pending.push(...(chunk.imports ?? []));
  }

  return [...dependencies].sort();
}

function isLocalJavaScriptChunk(path: string): boolean {
  if (path.startsWith("/") || hasUrlScheme(path)) {
    return false;
  }

  return path.endsWith(".js") || path.endsWith(".mjs");
}

function hasUrlScheme(value: string): boolean {
  const colon = value.indexOf(":");

  if (colon <= 0) {
    return false;
  }

  for (let index = 0; index < colon; index += 1) {
    const code = value.charCodeAt(index);
    const letter = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    const digit = code >= 48 && code <= 57;
    const allowedSymbol = code === 43 || code === 45 || code === 46;

    if (index === 0 ? !letter : !letter && !digit && !allowedSymbol) {
      return false;
    }
  }

  return true;
}
