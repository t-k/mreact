import { transformSync } from "oxc-transform";

const stripTypeScriptCache = new Map<string, string>();
const stripTypeScriptCacheLimit = 512;

/** Removes TypeScript syntax from a snippet with OXC while preserving JSX. */
export function stripTypeScriptWithOxc(source: string): string {
  if (!needsTypeScriptStripping(source)) {
    return source.trimEnd();
  }

  const cached = stripTypeScriptCache.get(source);

  if (cached !== undefined) {
    return cached;
  }

  const result = transformSync("snippet.tsx", source, {
    lang: "tsx",
    sourceType: "module",
    target: "es2022",
    jsx: "preserve",
    typescript: {
      onlyRemoveTypeImports: true,
    },
  });

  const stripped = result.errors.length > 0 ? source.trimEnd() : result.code.trimEnd();

  rememberStrippedTypeScript(source, stripped);

  return stripped;
}

function rememberStrippedTypeScript(source: string, stripped: string): void {
  if (stripTypeScriptCache.size >= stripTypeScriptCacheLimit) {
    const first = stripTypeScriptCache.keys().next().value;

    if (first !== undefined) {
      stripTypeScriptCache.delete(first);
    }
  }

  stripTypeScriptCache.set(source, stripped);
}

function needsTypeScriptStripping(source: string): boolean {
  return (
    /\bimport\s+type\b/.test(source) ||
    /\btype\s+[A-Za-z_$][\w$]*\b/.test(source) ||
    /\binterface\s+[A-Za-z_$][\w$]*\b/.test(source) ||
    /\b[A-Za-z_$][\w$.]*\s*<[^>\n]+>\s*\(/.test(source) ||
    /\bas\s+(?:const|[A-Za-z_$][\w$]*)\b/.test(source) ||
    /:\s*[A-Za-z_$][\w$<>,\s|&.[\]?]*(?=[,)=;{])/.test(source)
  );
}

export function transformJsxWithOxc(source: string): string {
  const result = transformSync("snippet.tsx", source, {
    lang: "tsx",
    sourceType: "module",
    target: "es2022",
    jsx: {
      runtime: "automatic",
      importSource: "@reckona/mreact-compat",
    },
    typescript: {
      onlyRemoveTypeImports: true,
    },
  });

  if (result.errors.length > 0 && result.code === "") {
    return stripTypeScriptWithOxc(source);
  }

  return result.code.trimEnd();
}

export function transformJsxToCreateElementWithOxc(source: string): string {
  const result = transformSync("snippet.tsx", source, {
    lang: "tsx",
    sourceType: "module",
    target: "es2022",
    jsx: {
      runtime: "classic",
      pragma: "createElement",
      pragmaFrag: "Fragment",
    },
    typescript: {
      onlyRemoveTypeImports: true,
    },
  });

  if (result.errors.length > 0 && result.code === "") {
    return stripTypeScriptWithOxc(source);
  }

  return result.code.trimEnd();
}
