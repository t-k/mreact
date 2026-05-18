import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform, type ServerOutputMode } from "@reckona/mreact-compiler";
import { build as bundle, type Plugin } from "esbuild";
import { runnerImport, type InlineConfig } from "vite";
import { resolveWorkspacePackageFile } from "./workspace-packages.js";
import type { BuiltServerModuleArtifact } from "./build.js";

const runnerConfig = {
  configFile: false,
  logLevel: "silent",
} satisfies InlineConfig;
const nativeEscapeTransform = {
  batchImportName: "escapeHtmlBatch",
  batchImportSource: "@reckona/mreact-router/native-escape",
} as const;
const sourceModuleCache = new Map<string, Promise<unknown>>();
const maxSourceModuleCacheEntries = 512;
const serverSourceTransformCache = new Map<string, string>();
const maxServerSourceTransformCacheEntries = 512;
let fileImportVersion = 0;

export async function importAppRouterSourceModule<T>(options: {
  cacheKey?: string | undefined;
  code: string;
  label: string;
  resolveDir?: string | undefined;
  serverSourceTransform?: ServerSourceTransformOptions | undefined;
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
  serverSourceTransform?: ServerSourceTransformOptions | undefined;
  sourcefile?: string | undefined;
}): Promise<T> {
  const code =
    options.resolveDir === undefined ? options.code : await bundleAppRouterSourceModule(options);
  const executableCode = withNodeRequireShimForEsmBundle({
    code,
    requireBaseDir:
      options.resolveDir ??
      (options.sourcefile === undefined ? undefined : dirname(options.sourcefile)),
  });
  const encodedLabel = encodeURIComponent(options.label.replace(/[^A-Za-z0-9_$.-]/g, "-"));
  const url = `data:text/javascript;base64,${Buffer.from(executableCode).toString(
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
  serverSourceTransform?: ServerSourceTransformOptions | undefined;
  sourcefile?: string | undefined;
}): Promise<string> {
  const output = await bundle({
    bundle: true,
    format: "esm",
    logLevel: "silent",
    platform: "node",
    plugins: [
      workspacePackageResolutionPlugin(),
      ...(options.serverSourceTransform === undefined
        ? []
        : [serverSourceTransformPlugin(options.serverSourceTransform)]),
    ],
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

interface ServerSourceTransformOptions {
  dev: boolean;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverOutput: ServerOutputMode;
}

function serverSourceTransformPlugin(options: ServerSourceTransformOptions): Plugin {
  return {
    name: "mreact-router-server-source-transform",
    setup(buildApi) {
      buildApi.onLoad({ filter: /(?:\.mreact)?\.[cm]?[jt]sx$/ }, async (args) => {
        if (args.path.includes(`${sep}node_modules${sep}`)) {
          return undefined;
        }

        const source = await readFile(args.path, "utf8");
        const contents = transformServerSourceFile({
          ...options,
          filename: args.path,
          source,
        });

        return {
          contents,
          loader: "js",
          resolveDir: dirname(args.path),
        };
      });
    },
  };
}

function transformServerSourceFile(
  options: ServerSourceTransformOptions & {
    filename: string;
    source: string;
  },
): string {
  const sourceHash = hashText(options.source);
  const artifact = options.serverModules?.get(options.filename)?.[options.serverOutput];

  if (artifact !== undefined && artifact.sourceHash === sourceHash) {
    return artifact.code;
  }

  const cacheKey = `${options.serverOutput}\0${options.dev ? "dev" : "prod"}\0${options.filename}\0${sourceHash}`;
  const cached = serverSourceTransformCache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const output = transform({
    code: options.source,
    dev: options.dev,
    filename: options.filename,
    serverEscape: nativeEscapeTransform,
    serverOutput: options.serverOutput,
    target: "server",
  });
  const fatalDiagnostics = output.diagnostics.filter(
    (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
  );

  if (fatalDiagnostics.length > 0) {
    throw new Error(fatalDiagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }

  setBoundedCacheEntry(
    serverSourceTransformCache,
    cacheKey,
    output.code,
    maxServerSourceTransformCacheEntries,
  );

  return output.code;
}

function withNodeRequireShimForEsmBundle(options: {
  code: string;
  requireBaseDir?: string | undefined;
}): string {
  if (!needsNodeRequireShim(options.code)) {
    return options.code;
  }

  const requireBaseUrl = pathToFileURL(
    join(options.requireBaseDir ?? process.cwd(), "__mreact_require_shim.cjs"),
  ).href;

  return `import { createRequire as __mreactCreateRequire } from "node:module";
const require = __mreactCreateRequire(${JSON.stringify(requireBaseUrl)});
${options.code}`;
}

function needsNodeRequireShim(code: string): boolean {
  return code.includes("Dynamic require of") && /\b__require\s*=/.test(code);
}

function workspacePackageResolutionPlugin() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const packageRoot = dirname(currentDir);
  const sourceOrDist = currentDir.endsWith(`${sep}dist`) ? "dist/index.js" : "src/index.ts";
  const appRouterGlobalsSourceOrDist = currentDir.endsWith(`${sep}dist`)
    ? "dist/app-router-globals.js"
    : "src/app-router-globals.ts";
  const linkSourceOrDist = currentDir.endsWith(`${sep}dist`) ? "dist/link.js" : "src/link.ts";
  const nativeEscapeSourceOrDist = currentDir.endsWith(`${sep}dist`)
    ? "dist/native-escape.js"
    : "src/native-escape.ts";
  const navigationStateSourceOrDist = currentDir.endsWith(`${sep}dist`)
    ? "dist/navigation-state.js"
    : "src/navigation-state.ts";
  const sessionSourceOrDist = currentDir.endsWith(`${sep}dist`)
    ? "dist/session.js"
    : "src/session.ts";
  const packageFile = (
    monorepoDir: string,
    packageName: string,
    entry: string,
    specifier: string,
    resolveDir?: string | undefined,
  ): string =>
    resolveWorkspacePackageFile({
      currentFileUrl: import.meta.url,
      entry,
      monorepoDir,
      packageName,
      resolveDir,
      specifier,
    });
  const entries = new Map<string, { entry: string; monorepoDir: string; packageName: string }>([
    ["@reckona/mreact", { entry: "index", monorepoDir: "react", packageName: "@reckona/mreact" }],
    [
      "@reckona/mreact/jsx-dev-runtime",
      { entry: "jsx-dev-runtime", monorepoDir: "react", packageName: "@reckona/mreact" },
    ],
    [
      "@reckona/mreact/jsx-runtime",
      { entry: "jsx-runtime", monorepoDir: "react", packageName: "@reckona/mreact" },
    ],
    [
      "@reckona/mreact-auth",
      { entry: "index", monorepoDir: "auth", packageName: "@reckona/mreact-auth" },
    ],
    [
      "@reckona/mreact-compat",
      { entry: "index", monorepoDir: "react-compat", packageName: "@reckona/mreact-compat" },
    ],
    [
      "@reckona/mreact-compat/event-priority",
      {
        entry: "event-priority",
        monorepoDir: "react-compat",
        packageName: "@reckona/mreact-compat",
      },
    ],
    [
      "@reckona/mreact-compat/flight",
      { entry: "flight", monorepoDir: "react-compat", packageName: "@reckona/mreact-compat" },
    ],
    [
      "@reckona/mreact-compat/internal",
      { entry: "internal", monorepoDir: "react-compat", packageName: "@reckona/mreact-compat" },
    ],
    [
      "@reckona/mreact-compat/jsx-dev-runtime",
      {
        entry: "jsx-dev-runtime",
        monorepoDir: "react-compat",
        packageName: "@reckona/mreact-compat",
      },
    ],
    [
      "@reckona/mreact-compat/jsx-runtime",
      { entry: "jsx-runtime", monorepoDir: "react-compat", packageName: "@reckona/mreact-compat" },
    ],
    [
      "@reckona/mreact-compat/scheduler",
      { entry: "scheduler", monorepoDir: "react-compat", packageName: "@reckona/mreact-compat" },
    ],
    [
      "@reckona/mreact-reactive-core",
      {
        entry: "index",
        monorepoDir: "reactive-core",
        packageName: "@reckona/mreact-reactive-core",
      },
    ],
    [
      "@reckona/mreact-query",
      { entry: "index", monorepoDir: "query", packageName: "@reckona/mreact-query" },
    ],
    [
      "@reckona/mreact-server",
      { entry: "index", monorepoDir: "server", packageName: "@reckona/mreact-server" },
    ],
  ]);
  const routerEntries = new Map([
    ["@reckona/mreact-router", join(packageRoot, sourceOrDist)],
    ["@reckona/mreact-router/app-router-globals", join(packageRoot, appRouterGlobalsSourceOrDist)],
    ["@reckona/mreact-router/link", join(packageRoot, linkSourceOrDist)],
    ["@reckona/mreact-router/native-escape", join(packageRoot, nativeEscapeSourceOrDist)],
    ["@reckona/mreact-router/navigation-state", join(packageRoot, navigationStateSourceOrDist)],
    ["@reckona/mreact-router/session", join(packageRoot, sessionSourceOrDist)],
    ["@reckona/mreact-router/internal/native-escape", join(packageRoot, nativeEscapeSourceOrDist)],
    ["@reckona/mreact-router/internal/session", join(packageRoot, sessionSourceOrDist)],
  ]);

  return {
    name: "mreact-router-workspace-packages",
    setup(buildApi: {
      onResolve(
        options: { filter: RegExp },
        callback: (args: { path: string; resolveDir: string }) => { path: string } | undefined,
      ): void;
    }) {
      buildApi.onResolve(
        {
          filter:
            /^@reckona\/(?:mreact(?:\/(?:jsx-dev-runtime|jsx-runtime))?|mreact-(?:auth|query|reactive-core|server|router|compat)(?:\/(?:event-priority|flight|internal|jsx-dev-runtime|jsx-runtime|scheduler|app-router-globals|link|native-escape|navigation-state|session|internal\/native-escape|internal\/session))?)$/,
        },
        (args) => {
          const routerPath = routerEntries.get(args.path);

          if (routerPath !== undefined) {
            return { path: routerPath };
          }

          const entry = entries.get(args.path);

          return entry === undefined
            ? undefined
            : {
                path: packageFile(
                  entry.monorepoDir,
                  entry.packageName,
                  entry.entry,
                  args.path,
                  args.resolveDir,
                ),
              };
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

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
