import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build as bundle } from "esbuild";
import { runnerImport, type InlineConfig } from "vite";

const runnerConfig = {
  configFile: false,
  logLevel: "silent",
} satisfies InlineConfig;
const sourceModuleCache = new Map<string, Promise<unknown>>();
const maxSourceModuleCacheEntries = 512;
let fileImportVersion = 0;

export async function importAppRouterSourceModule<T>(options: {
  cacheKey?: string | undefined;
  code: string;
  label: string;
  resolveDir?: string | undefined;
  sourcefile?: string | undefined;
}): Promise<T> {
  if (options.cacheKey !== undefined) {
    const cacheKey = options.cacheKey;
    const cached = sourceModuleCache.get(cacheKey) as Promise<T> | undefined;

    if (cached !== undefined) {
      return cached;
    }

    const loaded = importAppRouterSourceModuleWithoutCache<T>(options).catch((error) => {
      sourceModuleCache.delete(cacheKey);
      throw error;
    });
    setBoundedCacheEntry(sourceModuleCache, cacheKey, loaded, maxSourceModuleCacheEntries);

    return loaded;
  }

  return importAppRouterSourceModuleWithoutCache(options);
}

async function importAppRouterSourceModuleWithoutCache<T>(options: {
  code: string;
  label: string;
  resolveDir?: string | undefined;
  sourcefile?: string | undefined;
}): Promise<T> {
  const code =
    options.resolveDir === undefined ? options.code : await bundleAppRouterSourceModule(options);
  const encodedLabel = encodeURIComponent(options.label.replace(/[^A-Za-z0-9_$.-]/g, "-"));
  const url = `data:text/javascript;base64,${Buffer.from(code).toString(
    "base64",
  )}#${encodedLabel}-${Date.now()}-${Math.random()}`;
  const result = await runnerImport<T>(url, runnerConfig);

  return result.module;
}

export async function importAppRouterFileModule<T>(file: string): Promise<T> {
  fileImportVersion += 1;
  const url = `${pathToFileURL(file).href}?t=${Date.now()}${fileImportVersion}`;
  const result = await runnerImport<T>(url, runnerConfig);

  return result.module;
}

async function bundleAppRouterSourceModule(options: {
  code: string;
  label: string;
  resolveDir?: string | undefined;
  sourcefile?: string | undefined;
}): Promise<string> {
  const output = await bundle({
    bundle: true,
    format: "esm",
    logLevel: "silent",
    platform: "node",
    plugins: [workspacePackageResolutionPlugin()],
    stdin: {
      contents: options.code,
      loader:
        options.sourcefile?.endsWith(".tsx") || options.sourcefile?.endsWith(".mreact.tsx")
          ? "tsx"
          : "js",
      ...(options.resolveDir === undefined ? {} : { resolveDir: options.resolveDir }),
      ...(options.sourcefile === undefined ? {} : { sourcefile: options.sourcefile }),
    },
    write: false,
  });
  const code = output.outputFiles?.[0]?.text;

  if (code === undefined) {
    throw new Error(`Failed to bundle ${options.label} for Vite runner.`);
  }

  return code;
}

function workspacePackageResolutionPlugin() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const packageRoot = dirname(currentDir);
  const packagesDir = dirname(packageRoot);
  const sourceOrDist = currentDir.endsWith(`${sep}dist`) ? "dist/index.js" : "src/index.ts";
  const nativeEscapeSourceOrDist = currentDir.endsWith(`${sep}dist`)
    ? "dist/native-escape.js"
    : "src/native-escape.ts";
  const entries = new Map([
    ["@modular-react/auth", join(packagesDir, "auth", sourceOrDist)],
    ["@modular-react/reactive-core", join(packagesDir, "reactive-core", sourceOrDist)],
    ["@modular-react/query", join(packagesDir, "query", sourceOrDist)],
    ["@modular-react/server", join(packagesDir, "server", sourceOrDist)],
    ["@modular-react/router", join(packageRoot, sourceOrDist)],
    ["@modular-react/router/internal/native-escape", join(packageRoot, nativeEscapeSourceOrDist)],
  ]);

  return {
    name: "mreact-router-workspace-packages",
    setup(buildApi: {
      onResolve(
        options: { filter: RegExp },
        callback: (args: { path: string }) => { path: string } | undefined,
      ): void;
    }) {
      buildApi.onResolve(
        {
          filter:
            /^@modular-react\/(?:auth|query|reactive-core|server|router)(?:\/internal\/native-escape)?$/,
        },
        (args) => {
          const path = entries.get(args.path);

          return path === undefined ? undefined : { path };
        },
      );
    },
  };
}

function setBoundedCacheEntry<K, V>(cache: Map<K, V>, key: K, value: V, maxEntries: number): void {
  if (cache.size >= maxEntries) {
    const oldestKey = cache.keys().next().value as K | undefined;

    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }

  cache.set(key, value);
}
