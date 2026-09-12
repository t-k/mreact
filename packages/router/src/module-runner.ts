import { isCompatSsrFilename } from "./compat-ssr.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { formatDiagnostic } from "@reckona/mreact-compiler";
import type { ServerOutputMode } from "@reckona/mreact-shared/compiler-contract";
import { transformCompilerModuleContext } from "@reckona/mreact-compiler/internal";
import {
  createRunnableDevEnvironment,
  mergeConfig,
  resolveConfig,
  type FetchResult,
  type InlineConfig,
  type PluginOption,
  type RunnableDevEnvironment,
  type UserConfig,
} from "vite";
import { resolveWorkspacePackageFile } from "./workspace-packages.js";
import {
  bundleRouterModule,
  type RouterCompatBuildApi,
  type RouterCompatPlugin,
} from "./bundle-pipeline.js";
import { resolveRouterCacheLimit } from "./cache-config.js";
import type { BuiltServerModuleArtifact } from "./build.js";
import {
  createRouterRuntimeCacheCounters,
  readRouterRuntimeCacheEntry,
  routerRuntimeCacheStat,
  type RouterRuntimeCacheCounters,
  type RouterRuntimeCacheStat,
} from "./cache-stats.js";
import {
  compilerModuleContextForSource,
  createClientRouteInferenceCache,
  formatClientRouteInferenceDiagnostic,
  inferClientRouteModule,
  type ClientRouteInferenceCache,
} from "./client-route-inference.js";
import { viteDefineCacheKey, vitePluginsCacheKey } from "./vite-plugin-cache-key.js";
import { rewriteStaticModuleSpecifiers, staticModuleSpecifiers } from "./module-specifiers.js";

const runnerConfig = {
  configFile: false,
  logLevel: "silent",
} satisfies InlineConfig;
const nativeEscapeTransform = {
  batchImportName: "escapeHtmlBatch",
  batchImportSource: "@reckona/mreact-router/native-escape",
} as const;
const sourceModuleCache = new Map<string, Promise<unknown>>();
const maxSourceModuleCacheEntries = resolveRouterCacheLimit("SOURCE_MODULE", 512);
const sourceModuleCacheCounters = createRouterRuntimeCacheCounters();
const serverSourceTransformCache = new Map<string, string>();
const maxServerSourceTransformCacheEntries = resolveRouterCacheLimit(
  "SERVER_SOURCE_TRANSFORM",
  512,
);
const serverSourceTransformCacheCounters = createRouterRuntimeCacheCounters();
const packageTypeCache = new Map<string, string | undefined>();
const runnerVirtualModulePrefix = "virtual:mreact-router-source/";
const runnerVirtualModules = new Map<string, string>();
let sharedRunnerEnvironment: Promise<RunnableDevEnvironment> | undefined;
let fileImportVersion = 0;

export function routerModuleRunnerRuntimeCacheStats(): RouterRuntimeCacheStat[] {
  return [
    routerRuntimeCacheStat(
      "source-module",
      sourceModuleCache,
      maxSourceModuleCacheEntries,
      sourceModuleCacheCounters,
    ),
    routerRuntimeCacheStat(
      "server-source-transform",
      serverSourceTransformCache,
      maxServerSourceTransformCacheEntries,
      serverSourceTransformCacheCounters,
    ),
  ];
}

export async function importAppRouterSourceModule<T>(options: {
  cacheKey?: string | undefined;
  code: string;
  define?: UserConfig["define"] | undefined;
  externalizeAppSourceModuleDirs?: readonly string[] | undefined;
  label: string;
  plugins?: readonly RouterCompatPlugin[] | undefined;
  resolveDir?: string | undefined;
  root?: string | undefined;
  serverSourceTransform?: ServerSourceTransformOptions | undefined;
  sourcefile?: string | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<T> {
  if (options.cacheKey !== undefined) {
    const cacheKey = options.cacheKey;
    const cached = readRouterRuntimeCacheEntry(
      sourceModuleCache,
      cacheKey,
      sourceModuleCacheCounters,
    ) as Promise<T> | undefined;

    if (cached !== undefined) {
      return cached;
    }

    const loaded = importAppRouterSourceModuleWithoutCache<T>(options).catch((error) => {
      sourceModuleCache.delete(cacheKey);
      throw error;
    });
    setBoundedCacheEntry(
      sourceModuleCache,
      cacheKey,
      loaded,
      maxSourceModuleCacheEntries,
      sourceModuleCacheCounters,
    );

    return loaded;
  }

  return importAppRouterSourceModuleWithoutCache(options);
}

async function importAppRouterSourceModuleWithoutCache<T>(options: {
  code: string;
  define?: UserConfig["define"] | undefined;
  externalizeAppSourceModuleDirs?: readonly string[] | undefined;
  label: string;
  plugins?: readonly RouterCompatPlugin[] | undefined;
  resolveDir?: string | undefined;
  root?: string | undefined;
  serverSourceTransform?: ServerSourceTransformOptions | undefined;
  sourcefile?: string | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<T> {
  const code =
    options.resolveDir === undefined
      ? options.code
      : rewriteCompatVendorPlaceholderImportsForRunner(
          await bundleAppRouterSourceModule({
            ...options,
            externalizeServerRenderValueRuntime: true,
          }),
          options.resolveDir,
        );
  const sourcefile = options.sourcefile ?? join(options.resolveDir ?? process.cwd(), "module.js");
  const executableCode = withNodeRequireShimForEsmBundle({
    code: withFileImportMetaUrl(code, sourcefile),
    filename: sourcefile,
    requireBaseDir:
      options.resolveDir ??
      (options.sourcefile === undefined ? undefined : dirname(options.sourcefile)),
  });
  const encodedLabel = encodeURIComponent(options.label.replace(/[^A-Za-z0-9_$.-]/g, "-"));
  const publicId = `${runnerVirtualModulePrefix}${encodedLabel}-${Date.now()}-${Math.random()}.mjs`;
  runnerVirtualModules.set(publicId, executableCode);

  try {
    return await importWithSharedRunner<T>(publicId, { invalidateEntry: true });
  } finally {
    runnerVirtualModules.delete(publicId);
  }
}

export async function importAppRouterFileModule<T>(file: string): Promise<T> {
  fileImportVersion += 1;
  const url = `${pathToFileURL(file).href}?t=${Date.now()}${fileImportVersion}`;

  return await importWithSharedRunner<T>(url, { invalidateEntry: true });
}

async function importWithSharedRunner<T>(
  moduleId: string,
  options?: { invalidateEntry?: boolean | undefined },
): Promise<T> {
  const environment = await getSharedRunnerEnvironment();
  const module = (await environment.runner.import(moduleId)) as T;

  if (options?.invalidateEntry === true) {
    const evaluatedModule =
      environment.runner.evaluatedModules.getModuleByUrl(moduleId) ??
      environment.runner.evaluatedModules.getModuleById(moduleId) ??
      environment.runner.evaluatedModules.getModuleById(`\0${moduleId}`);

    if (evaluatedModule !== undefined) {
      environment.runner.evaluatedModules.invalidateModule(evaluatedModule);
    }
  }

  return module;
}

async function getSharedRunnerEnvironment(): Promise<RunnableDevEnvironment> {
  if (sharedRunnerEnvironment !== undefined) {
    return await sharedRunnerEnvironment;
  }

  sharedRunnerEnvironment = createSharedRunnerEnvironment().catch((error) => {
    sharedRunnerEnvironment = undefined;
    throw error;
  });

  return await sharedRunnerEnvironment;
}

async function createSharedRunnerEnvironment(): Promise<RunnableDevEnvironment> {
  const config = await resolveConfig(
    mergeConfig(runnerConfig, {
      cacheDir: process.cwd(),
      configFile: false,
      envDir: false,
      environments: {
        mreact_router: {
          consumer: "server",
          dev: { moduleRunnerTransform: true },
          resolve: {
            conditions: ["node"],
            external: true,
            mainFields: [],
          },
        },
      },
      plugins: [
        {
          name: "mreact-router-source-module",
          resolveId(source) {
            return runnerVirtualModules.has(source) ? `\0${source}` : undefined;
          },
          load(id) {
            const source = id.startsWith("\0") ? id.slice(1) : id;

            return source.startsWith(runnerVirtualModulePrefix)
              ? runnerVirtualModules.get(source)
              : undefined;
          },
        },
        nativeExternalModulePlugin(),
      ],
    } satisfies InlineConfig),
    "serve",
  );
  const environment = createRunnableDevEnvironment("mreact_router", config, {
    hot: false,
    runnerOptions: { hmr: { logger: false } },
  });
  const fetchModule = environment.fetchModule.bind(environment);
  // Vite treats file URLs as transformable sources, so without this override
  // a node_modules file would be re-evaluated inside the runner graph instead
  // of sharing the process-wide native instance (registries, hook dispatchers).
  environment.fetchModule = (id, importer, options) => {
    const external = nativeExternalModuleFetchResult(id);

    return external === undefined ? fetchModule(id, importer, options) : Promise.resolve(external);
  };
  await environment.init();

  return environment;
}

// Runs before vite:resolve so importAnalysis keeps the file URL as the import
// specifier; module-runner transform then rewrites every reference through the
// namespace object with real scope analysis, preserving live bindings.
// Stryker disable all: the shared environment is created once per worker, so
// creation-time mutants are only observable from a fresh process; the native
// instance identity and missing-export tests cover this wiring there.
function nativeExternalModulePlugin(): PluginOption {
  return {
    name: "mreact-router-native-external-module",
    enforce: "pre",
    resolveId(source) {
      const url = nativeExternalModuleUrl(source);

      return url === undefined ? undefined : { external: true, id: url };
    },
  };
}
// Stryker restore all

// The runner only sees file URLs for native externals because resolveId
// rewrites accepted absolute paths to URLs; every other id (Vite's /@fs/ and
// root-relative forms, ?t= cache busting) belongs to the runner graph.
function nativeExternalModuleFetchResult(id: string): FetchResult | undefined {
  const file = id.startsWith("file://") ? nativeExternalModuleFile(id) : undefined;

  return file === undefined
    ? undefined
    : {
        externalize: pathToFileURL(file).href,
        type: isNodeCommonJsModuleFile(file) ? "commonjs" : "module",
      };
}

// Claims the specifier shapes the bundler emits for externals: file URLs and
// absolute paths of existing files. Vite's own ids (/@fs/..., /@id/..., and
// root-relative /node_modules/... URLs) do not exist as paths and stay with Vite.
function nativeExternalModuleUrl(specifier: string): string | undefined {
  const file = nativeExternalModuleFile(specifier);

  // Stryker disable next-line ConditionalExpression: existsSync(undefined) is false, so the type guard has no runtime effect.
  return file === undefined || !existsSync(file) ? undefined : pathToFileURL(file).href;
}

function nativeExternalModuleFile(specifier: string): string | undefined {
  if (specifier.includes("?") || specifier.includes("#")) {
    return undefined;
  }

  const file = nodeModulesExternalImportPath(specifier);

  return file !== undefined && isNodeImportableModuleFile(file) ? file : undefined;
}

export async function importAppRouterBuiltFileModule<T>(options: {
  cacheKey?: string | undefined;
  file: string;
}): Promise<T> {
  if (options.cacheKey !== undefined) {
    const cacheKey = options.cacheKey;
    const cached = readRouterRuntimeCacheEntry(
      sourceModuleCache,
      cacheKey,
      sourceModuleCacheCounters,
    ) as Promise<T> | undefined;

    if (cached !== undefined) {
      return cached;
    }

    const loaded = import(pathToFileURL(options.file).href).catch((error) => {
      sourceModuleCache.delete(cacheKey);
      throw error;
    }) as Promise<T>;
    setBoundedCacheEntry(
      sourceModuleCache,
      cacheKey,
      loaded,
      maxSourceModuleCacheEntries,
      sourceModuleCacheCounters,
    );

    return loaded;
  }

  return (await import(pathToFileURL(options.file).href)) as T;
}

export const COMPAT_VENDOR_PLACEHOLDER_PREFIX = "mreact-compat-vendor:";
export const SERVER_RENDER_VALUE_PLACEHOLDER = "mreact-server-render-value:internal";
const serverRenderValueSpecifier = "@reckona/mreact-shared/server-render-value-internal";

// Specifier-to-dist-entry table for the react-compat server family. The
// per-route externalization plugin and the shared vendor chunk build must
// agree exactly with the workspace alias table above, so both derive from
// this map.
const compatVendorSpecifierEntries = new Map<string, string>([
  ["react", "index"],
  ["react-dom", "index"],
  ["react-dom/client", "index"],
  ["react-dom/server", "index"],
  ["react/jsx-dev-runtime", "jsx-dev-runtime"],
  ["react/jsx-runtime", "jsx-runtime"],
  ["@reckona/mreact-compat", "index"],
  ["@reckona/mreact-compat/event-priority", "event-priority"],
  ["@reckona/mreact-compat/flight", "flight"],
  ["@reckona/mreact-compat/hooks", "hooks-entry"],
  ["@reckona/mreact-compat/internal", "internal"],
  ["@reckona/mreact-compat/jsx-dev-runtime", "jsx-dev-runtime"],
  ["@reckona/mreact-compat/jsx-runtime", "jsx-runtime"],
  ["@reckona/mreact-compat/scheduler", "scheduler"],
  ["@reckona/mreact-compat/server", "server"],
]);

const compatVendorEntrySpecifiers = new Map<string, string>([
  ["index", "@reckona/mreact-compat"],
  ["jsx-runtime", "@reckona/mreact-compat/jsx-runtime"],
  ["jsx-dev-runtime", "@reckona/mreact-compat/jsx-dev-runtime"],
  ["hooks-entry", "@reckona/mreact-compat/hooks"],
  ["scheduler", "@reckona/mreact-compat/scheduler"],
  ["event-priority", "@reckona/mreact-compat/event-priority"],
  ["flight", "@reckona/mreact-compat/flight"],
  ["internal", "@reckona/mreact-compat/internal"],
  ["server", "@reckona/mreact-compat/server"],
]);

export function compatVendorEntryNames(): readonly string[] {
  return [...compatVendorEntrySpecifiers.keys()];
}

// Cheap build-time prefilter. A false positive only costs one unused vendor
// chunk build; a false negative keeps the per-route inlining fallback.
const compatVendorSpecifierPattern =
  /["'](?:react|react-dom|react\/jsx(?:-dev)?-runtime|react-dom\/(?:client|server)|@reckona\/mreact-compat(?:\/[\w-]+)?)["']/u;

export function sourceReferencesCompatVendorSpecifier(source: string): boolean {
  return compatVendorSpecifierPattern.test(source);
}

export function resolveCompatVendorEntryFiles(resolveDir?: string): Map<string, string> {
  const files = new Map<string, string>();

  for (const [entry, specifier] of compatVendorEntrySpecifiers) {
    files.set(
      entry,
      resolveWorkspacePackageFile({
        currentFileUrl: import.meta.url,
        entry,
        monorepoDir: "react-compat",
        packageName: "@reckona/mreact-compat",
        resolveDir,
        specifier,
      }),
    );
  }

  return files;
}

export function rewriteCompatVendorPlaceholderImportsForRunner(
  code: string,
  resolveDir?: string,
): string {
  const specifiers = staticModuleSpecifiers(code);
  const usesCompatVendor = specifiers.some((specifier) =>
    specifier.startsWith(COMPAT_VENDOR_PLACEHOLDER_PREFIX),
  );
  const usesServerRenderValue = specifiers.includes(SERVER_RENDER_VALUE_PLACEHOLDER);
  const entryFiles = usesCompatVendor ? resolveCompatVendorEntryFiles(resolveDir) : undefined;
  const serverRenderValueFile = usesServerRenderValue
    ? resolveServerRenderValueEntryFile(resolveDir)
    : undefined;

  return rewriteStaticModuleSpecifiers(code, (specifier) => {
    if (specifier === SERVER_RENDER_VALUE_PLACEHOLDER && serverRenderValueFile !== undefined) {
      return pathToFileURL(serverRenderValueFile).href;
    }
    if (specifier.startsWith(COMPAT_VENDOR_PLACEHOLDER_PREFIX)) {
      const entry = specifier.slice(COMPAT_VENDOR_PLACEHOLDER_PREFIX.length);
      const file = entryFiles?.get(entry);

      return file === undefined ? undefined : pathToFileURL(file).href;
    }
    return undefined;
  });
}

export function resolveServerRenderValueEntryFile(resolveDir?: string): string {
  return resolveWorkspacePackageFile({
    currentFileUrl: import.meta.url,
    entry: "server-render-value-internal",
    monorepoDir: "shared",
    packageName: "@reckona/mreact-shared",
    resolveDir,
    specifier: serverRenderValueSpecifier,
  });
}

// Marks every compat-family import as external with a deterministic
// placeholder specifier; writeServerModuleArtifactFiles later rewrites the
// placeholders to relative paths into the emitted shared vendor chunks.
export function compatVendorExternalizePlugin(): RouterCompatPlugin {
  return {
    name: "mreact-compat-vendor-externalize",
    setup(buildApi) {
      buildApi.onResolve(
        {
          filter: /^(?:react|react-dom|react\/.+|react-dom\/.+|@reckona\/mreact-compat(?:\/.+)?)$/u,
        },
        (args) => {
          const entry = compatVendorSpecifierEntries.get(args.path);

          return entry === undefined
            ? undefined
            : { external: true, path: `${COMPAT_VENDOR_PLACEHOLDER_PREFIX}${entry}` };
        },
      );
    },
  };
}

export function serverRenderValueExternalizePlugin(): RouterCompatPlugin {
  return {
    name: "mreact-server-render-value-externalize",
    setup(buildApi) {
      buildApi.onResolve(
        { filter: /^@reckona\/mreact-shared\/server-render-value-internal$/u },
        () => ({
          external: true,
          path: SERVER_RENDER_VALUE_PLACEHOLDER,
        }),
      );
    },
  };
}

export async function bundleAppRouterSourceModule(options: {
  code: string;
  define?: UserConfig["define"] | undefined;
  externalizeAppSourceModuleDirs?: readonly string[] | undefined;
  externalizeCompatVendor?: boolean | undefined;
  externalizeServerRenderValueRuntime?: boolean | undefined;
  label: string;
  plugins?: readonly RouterCompatPlugin[] | undefined;
  resolveDir?: string | undefined;
  root?: string | undefined;
  serverSourceTransform?: ServerSourceTransformOptions | undefined;
  sourcefile?: string | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string> {
  const output = await bundleRouterModule({
    code: options.code,
    define: options.define,
    externalizeAppSourceModuleDirs: options.externalizeAppSourceModuleDirs,
    filename: options.sourcefile ?? join(options.resolveDir ?? process.cwd(), "module.js"),
    platform: "node",
    root: options.root,
    vitePlugins: options.vitePlugins,
    plugins: [
      ...(options.externalizeCompatVendor === true ? [compatVendorExternalizePlugin()] : []),
      ...(options.externalizeServerRenderValueRuntime === true
        ? [serverRenderValueExternalizePlugin()]
        : []),
      workspacePackageResolutionPlugin(),
      ...(options.serverSourceTransform === undefined
        ? []
        : [serverSourceTransformPlugin(options.serverSourceTransform)]),
      ...(options.plugins ?? []),
    ],
  });
  const code = output.code;

  if (code === undefined) {
    throw new Error(`Failed to bundle ${options.label} for Vite runner.`);
  }

  return code;
}

export function fileImportMetaUrlPlugin(): RouterCompatPlugin {
  const workspacePackagesDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

  return {
    name: "mreact-router-file-import-meta-url",
    setup(buildApi) {
      buildApi.onLoad({ filter: /(?:\.mreact)?\.[cm]?[jt]sx?$/ }, async (args) => {
        if (
          args.path.includes(`${sep}node_modules${sep}`) ||
          args.path.startsWith(`${workspacePackagesDir}${sep}`)
        ) {
          return undefined;
        }

        const source = await readFile(args.path, "utf8");

        return {
          contents: withFileImportMetaUrl(source, args.path),
          loader: "js",
          resolveDir: dirname(args.path),
        };
      });
    },
  };
}

interface ServerSourceTransformOptions {
  clientRouteInferenceCache?: ClientRouteInferenceCache | undefined;
  define?: UserConfig["define"] | undefined;
  dev: boolean;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverOutput: ServerOutputMode;
  vitePlugins?: readonly PluginOption[] | undefined;
}

function serverSourceTransformPlugin(options: ServerSourceTransformOptions): RouterCompatPlugin {
  const clientRouteInferenceCache =
    options.clientRouteInferenceCache ?? createClientRouteInferenceCache();
  const workspacePackagesDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

  return {
    name: "mreact-router-server-source-transform",
    setup(buildApi) {
      buildApi.onLoad({ filter: /(?:\.mreact)?\.[cm]?[jt]sx$/ }, async (args) => {
        if (args.path.includes(`${sep}node_modules${sep}`)) {
          return undefined;
        }

        if (args.path.startsWith(`${workspacePackagesDir}${sep}`)) {
          return undefined;
        }

        const source = await readFile(args.path, "utf8");
        const contents = await transformServerSourceFile({
          ...options,
          clientRouteInferenceCache,
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

async function transformServerSourceFile(
  options: ServerSourceTransformOptions & {
    filename: string;
    source: string;
  },
): Promise<string> {
  const sourceHash = hashText(options.source);
  const artifact = options.serverModules?.get(options.filename)?.[options.serverOutput];

  if (artifact !== undefined && artifact.sourceHash === sourceHash) {
    return artifact.code;
  }

  const source = options.dev
    ? withFileImportMetaUrl(options.source, options.filename)
    : options.source;
  const transformedSourceHash = source === options.source ? sourceHash : hashText(source);
  const clientRouteInferenceCache =
    options.clientRouteInferenceCache ?? createClientRouteInferenceCache();
  const moduleContext = await compilerModuleContextForSource({
    cache: clientRouteInferenceCache,
    code: source,
    filename: options.filename,
  });
  const clientInference = await inferClientRouteModule({
    cache: clientRouteInferenceCache,
    code: source,
    filename: options.filename,
    moduleContext,
    vitePlugins: options.vitePlugins,
  });

  for (const diagnostic of clientInference.diagnostics) {
    console.warn(formatClientRouteInferenceDiagnostic(diagnostic));
  }

  const cacheKey = `${options.serverOutput}\0${options.dev ? "dev" : "prod"}\0${options.filename}\0${transformedSourceHash}\0${clientInference.clientBoundaryImports.join("\0")}\0${clientInference.clientBoundaryFallbackImports.join("\0")}\0${(clientInference.clientBoundaryCompatImports ?? []).join("\0")}\0${viteDefineCacheKey(options.define)}\0${vitePluginsCacheKey(options.vitePlugins)}`;
  const cached = readRouterRuntimeCacheEntry(
    serverSourceTransformCache,
    cacheKey,
    serverSourceTransformCacheCounters,
  );

  if (cached !== undefined) {
    return cached;
  }

  const output = transformCompilerModuleContext({
    code: source,
    clientBoundaryImports: clientInference.clientBoundaryImports,
    clientBoundaryFallbackImports: clientInference.clientBoundaryFallbackImports,
    clientBoundaryCompatImports: clientInference.clientBoundaryCompatImports,
    dev: options.dev,
    filename: options.filename,
    moduleContext,
    serverEscape: nativeEscapeTransform,
    serverOutput: options.serverOutput,
    ...(isCompatSsrFilename(options.filename)
      ? { target: "client" as const, mode: "compat" as const }
      : { target: "server" as const }),
  });
  const fatalDiagnostics = output.diagnostics.filter(
    (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
  );

  if (fatalDiagnostics.length > 0) {
    throw new Error(
      fatalDiagnostics
        .map((diagnostic) => formatDiagnostic(options.filename, diagnostic))
        .join("\n"),
    );
  }

  setBoundedCacheEntry(
    serverSourceTransformCache,
    cacheKey,
    output.code,
    maxServerSourceTransformCacheEntries,
    serverSourceTransformCacheCounters,
  );

  return output.code;
}

function withFileImportMetaUrl(source: string, filename: string): string {
  if (!source.includes("import.meta.url")) {
    return source;
  }

  return replaceImportMetaUrlExpressions(source, JSON.stringify(pathToFileURL(filename).href));
}

function replaceImportMetaUrlExpressions(source: string, replacement: string): string {
  return replaceImportMetaUrlInCode(source, 0, source.length, replacement, false).text;
}

function replaceImportMetaUrlInCode(
  source: string,
  start: number,
  end: number,
  replacement: string,
  stopAtTemplateExpressionEnd: boolean,
): { next: number; text: string } {
  let output = "";
  let copyStart = start;
  let index = start;
  let braceDepth = 0;

  while (index < end) {
    const char = source[index];

    if (stopAtTemplateExpressionEnd && char === "}") {
      if (braceDepth === 0) {
        break;
      }
      braceDepth -= 1;
      index += 1;
      continue;
    }

    if (isImportMetaUrlToken(source, index)) {
      output += source.slice(copyStart, index);
      output += replacement;
      index += "import.meta.url".length;
      copyStart = index;
      continue;
    }

    if (char === '"' || char === "'") {
      index = skipQuotedString(source, index, char);
      continue;
    }

    if (char === "`") {
      const template = replaceImportMetaUrlInTemplate(source, index, replacement);
      output += source.slice(copyStart, index);
      output += template.text;
      index = template.next;
      copyStart = index;
      continue;
    }

    if (char === "/" && source[index + 1] === "/") {
      index = skipLineComment(source, index + 2);
      continue;
    }

    if (char === "/" && source[index + 1] === "*") {
      index = skipBlockComment(source, index + 2);
      continue;
    }

    if (stopAtTemplateExpressionEnd && char === "{") {
      braceDepth += 1;
    }

    index += 1;
  }

  return {
    next: index,
    text: output + source.slice(copyStart, index),
  };
}

function replaceImportMetaUrlInTemplate(
  source: string,
  start: number,
  replacement: string,
): { next: number; text: string } {
  let output = "`";
  let copyStart = start + 1;
  let index = start + 1;

  while (index < source.length) {
    const char = source[index];

    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === "`") {
      return {
        next: index + 1,
        text: output + source.slice(copyStart, index + 1),
      };
    }

    if (char === "$" && source[index + 1] === "{") {
      output += source.slice(copyStart, index + 2);
      const expression = replaceImportMetaUrlInCode(
        source,
        index + 2,
        source.length,
        replacement,
        true,
      );
      output += expression.text;
      index = expression.next;

      if (source[index] === "}") {
        output += "}";
        index += 1;
      }

      copyStart = index;
      continue;
    }

    index += 1;
  }

  return {
    next: index,
    text: output + source.slice(copyStart, index),
  };
}

function isImportMetaUrlToken(source: string, index: number): boolean {
  return (
    source.startsWith("import.meta.url", index) &&
    !isIdentifierPartCode(source.charCodeAt(index - 1)) &&
    !isIdentifierPartCode(source.charCodeAt(index + "import.meta.url".length))
  );
}

function isIdentifierPartCode(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 36 ||
    code === 95
  );
}

function skipQuotedString(source: string, start: number, quote: string): number {
  let index = start + 1;

  while (index < source.length) {
    const char = source[index];

    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === quote) {
      return index + 1;
    }

    index += 1;
  }

  return index;
}

function skipLineComment(source: string, start: number): number {
  const end = source.indexOf("\n", start);

  return end === -1 ? source.length : end + 1;
}

function skipBlockComment(source: string, start: number): number {
  const end = source.indexOf("*/", start);

  return end === -1 ? source.length : end + 2;
}

function withNodeRequireShimForEsmBundle(options: {
  code: string;
  filename: string;
  requireBaseDir?: string | undefined;
}): string {
  const requireBaseUrl = pathToFileURL(
    join(options.requireBaseDir ?? process.cwd(), "__mreact_require_shim.cjs"),
  ).href;
  const rewritten = rewriteNodeModulesCommonJsImports(options.code);
  const code = rewritten.code.replaceAll(
    "createRequire(import.meta.url)",
    `createRequire(${JSON.stringify(requireBaseUrl)})`,
  );
  const needsFilenameGlobalShim = needsCommonJsFilenameGlobalShim(options.code);
  const needsRequireShim = needsNodeRequireShim(options.code);

  if (!rewritten.needsRequire && !needsFilenameGlobalShim && !needsRequireShim) {
    return code;
  }

  return `${
    needsFilenameGlobalShim
      ? `const __filename = ${JSON.stringify(options.filename)};
const __dirname = ${JSON.stringify(dirname(options.filename))};
`
      : ""
  }${
    rewritten.needsRequire || needsRequireShim
      ? `import { createRequire as __mreactCreateRequire } from "node:module";
const __mreactRequire = __mreactCreateRequire(${JSON.stringify(requireBaseUrl)});
const require = __mreactRequire;
`
      : ""
  }${code}`;
}

function needsCommonJsFilenameGlobalShim(code: string): boolean {
  return /\b__(?:filename|dirname)\b/.test(code);
}

function needsNodeRequireShim(code: string): boolean {
  return code.includes("Dynamic require of") && /\b__require\s*=/.test(code);
}

// ESM externals keep their import statements: the shared runner externalizes
// them natively (see nativeExternalModulePlugin). CommonJS externals cannot be
// evaluated by the runner transform, so they become createRequire calls whose
// destructured locals keep the original names; no identifier rewriting runs.
function rewriteNodeModulesCommonJsImports(code: string): {
  code: string;
  needsRequire: boolean;
} {
  let needsRequire = false;
  let importIndex = 0;
  const importFromPattern = /^import\s+([^;\n]+?)\s+from\s+(["'])([^"']+)\2;?$/gm;
  const sideEffectImportPattern = /^import\s+(["'])([^"']+)\1;?$/gm;
  const withRewrittenImports = code.replace(
    importFromPattern,
    (statement: string, clause: string, _quote: string, specifier: string) => {
      const file = nodeModulesCommonJsImportPath(specifier);

      if (file === undefined) {
        return statement;
      }

      needsRequire = true;

      return commonJsImportClauseToRequireStatements(
        clause.trim(),
        `__mreactRequire(${JSON.stringify(file)})`,
        importIndex++,
      );
    },
  );
  const rewrittenCode = withRewrittenImports.replace(
    sideEffectImportPattern,
    (statement: string, _quote: string, specifier: string) => {
      const file = nodeModulesCommonJsImportPath(specifier);

      if (file === undefined) {
        return statement;
      }

      needsRequire = true;

      return `__mreactRequire(${JSON.stringify(file)});`;
    },
  );

  return { code: rewrittenCode, needsRequire };
}

function nodeModulesCommonJsImportPath(specifier: string): string | undefined {
  const file = nodeModulesExternalImportPath(specifier);

  return file !== undefined && isNodeImportableModuleFile(file) && isNodeCommonJsModuleFile(file)
    ? file
    : undefined;
}

function nodeModulesExternalImportPath(specifier: string): string | undefined {
  const file = externalImportFilePath(specifier);

  if (file === undefined || !isNodeModulesPath(file)) {
    return undefined;
  }

  return file;
}

function externalImportFilePath(specifier: string): string | undefined {
  if (specifier.startsWith("file://")) {
    try {
      return fileURLToPath(specifier);
    } catch {
      return undefined;
    }
  }

  return isAbsolute(specifier) ? specifier : undefined;
}

function isNodeModulesPath(file: string): boolean {
  return file.split(/[\\/]/u).includes("node_modules");
}

function isNodeImportableModuleFile(file: string): boolean {
  const extension = extname(file);

  return (
    extension === ".cjs" || extension === ".mjs" || extension === ".js" || extension === ".node"
  );
}

function isNodeCommonJsModuleFile(file: string): boolean {
  const extension = extname(file);

  if (extension === ".cjs" || extension === ".cts" || extension === ".node") {
    return true;
  }

  if (extension === ".mjs" || extension === ".mts" || extension !== ".js") {
    return false;
  }

  return nearestPackageType(file) !== "module";
}

function nearestPackageType(file: string): string | undefined {
  let directory = dirname(file);

  while (true) {
    const packageJson = join(directory, "package.json");

    if (packageTypeCache.has(packageJson)) {
      return packageTypeCache.get(packageJson);
    }

    if (existsSync(packageJson)) {
      const type = readPackageType(packageJson);
      packageTypeCache.set(packageJson, type);
      return type;
    }

    const parent = dirname(directory);

    if (parent === directory) {
      return undefined;
    }

    directory = parent;
  }
}

function readPackageType(packageJson: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(packageJson, "utf8")) as { type?: unknown };

    return typeof parsed.type === "string" ? parsed.type : undefined;
  } catch {
    return undefined;
  }
}

function commonJsImportClauseToRequireStatements(
  clause: string,
  requireExpression: string,
  importIndex: number,
): string {
  if (clause.startsWith("* as ")) {
    return `const ${clause.slice(5).trim()} = ${requireExpression};`;
  }

  if (clause.startsWith("{")) {
    return namedCommonJsImportsToRequireStatements(clause, requireExpression);
  }

  const commaIndex = clause.indexOf(",");

  if (commaIndex === -1) {
    return `const ${clause} = ${requireExpression};`;
  }

  const defaultName = clause.slice(0, commaIndex).trim();
  const namedOrNamespace = clause.slice(commaIndex + 1).trim();
  const temporaryName = `__mreactExternalCommonJs${importIndex}`;
  const statements = [
    `const ${temporaryName} = ${requireExpression};`,
    `const ${defaultName} = ${temporaryName};`,
  ];

  if (namedOrNamespace.startsWith("* as ")) {
    statements.push(`const ${namedOrNamespace.slice(5).trim()} = ${temporaryName};`);
  } else if (namedOrNamespace.startsWith("{")) {
    statements.push(namedCommonJsImportsToRequireStatements(namedOrNamespace, temporaryName));
  }

  return statements.join("\n");
}

function namedCommonJsImportsToRequireStatements(clause: string, sourceExpression: string): string {
  const objectBindings: string[] = [];
  const statements: string[] = [];

  for (const binding of namedImportBindings(clause)) {
    if (binding.imported === "default") {
      statements.push(`const ${binding.local} = ${sourceExpression};`);
    } else if (binding.imported === binding.local) {
      objectBindings.push(binding.imported);
    } else {
      objectBindings.push(`${JSON.stringify(binding.imported)}: ${binding.local}`);
    }
  }

  if (objectBindings.length > 0) {
    statements.unshift(`const { ${objectBindings.join(", ")} } = ${sourceExpression};`);
  }

  return statements.join("\n");
}

function namedImportBindings(clause: string): Array<{ imported: string; local: string }> {
  return clause
    .slice(1, -1)
    .split(",")
    .map((binding) => binding.trim())
    .filter((binding) => binding.length > 0)
    .map((binding) => {
      const alias = binding.match(/^(.+?)\s+as\s+(.+)$/);
      const imported = alias?.[1]?.trim() ?? binding;
      const local = alias?.[2]?.trim() ?? binding;

      return { imported, local };
    });
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
  const streamListSourceOrDist = currentDir.endsWith(`${sep}dist`)
    ? "dist/stream-list.js"
    : "src/stream-list.ts";
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
    [
      "react",
      { entry: "index", monorepoDir: "react-compat", packageName: "@reckona/mreact-compat" },
    ],
    [
      "react-dom",
      { entry: "index", monorepoDir: "react-compat", packageName: "@reckona/mreact-compat" },
    ],
    [
      "react-dom/client",
      { entry: "index", monorepoDir: "react-compat", packageName: "@reckona/mreact-compat" },
    ],
    [
      "react-dom/server",
      { entry: "index", monorepoDir: "react-compat", packageName: "@reckona/mreact-compat" },
    ],
    [
      "react/jsx-dev-runtime",
      {
        entry: "jsx-dev-runtime",
        monorepoDir: "react-compat",
        packageName: "@reckona/mreact-compat",
      },
    ],
    [
      "react/jsx-runtime",
      { entry: "jsx-runtime", monorepoDir: "react-compat", packageName: "@reckona/mreact-compat" },
    ],
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
      "@reckona/mreact-compat/hooks",
      { entry: "hooks-entry", monorepoDir: "react-compat", packageName: "@reckona/mreact-compat" },
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
      "@reckona/mreact-compat/server",
      { entry: "server", monorepoDir: "react-compat", packageName: "@reckona/mreact-compat" },
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
    [
      "@reckona/mreact-shared/server-render-value-internal",
      {
        entry: "server-render-value-internal",
        monorepoDir: "shared",
        packageName: "@reckona/mreact-shared",
      },
    ],
  ]);
  const routerEntries = new Map([
    ["@reckona/mreact-router", join(packageRoot, sourceOrDist)],
    ["@reckona/mreact-router/app-router-globals", join(packageRoot, appRouterGlobalsSourceOrDist)],
    ["@reckona/mreact-router/link", join(packageRoot, linkSourceOrDist)],
    ["@reckona/mreact-router/native-escape", join(packageRoot, nativeEscapeSourceOrDist)],
    ["@reckona/mreact-router/navigation-state", join(packageRoot, navigationStateSourceOrDist)],
    ["@reckona/mreact-router/session", join(packageRoot, sessionSourceOrDist)],
    ["@reckona/mreact-router/stream-list", join(packageRoot, streamListSourceOrDist)],
    ["@reckona/mreact-router/internal/native-escape", join(packageRoot, nativeEscapeSourceOrDist)],
    ["@reckona/mreact-router/internal/session", join(packageRoot, sessionSourceOrDist)],
  ]);

  return {
    name: "mreact-router-workspace-packages",
    setup(buildApi: Pick<RouterCompatBuildApi, "onResolve">) {
      buildApi.onResolve(
        {
          filter:
            /^(?:react(?:\/jsx-(?:dev-)?runtime)?|react-dom(?:\/(?:client|server))?|@reckona\/(?:mreact(?:\/(?:jsx-dev-runtime|jsx-runtime))?|mreact-shared\/server-render-value-internal|mreact-(?:auth|query|reactive-core|server|router|compat)(?:\/(?:event-priority|flight|internal|jsx-dev-runtime|jsx-runtime|scheduler|app-router-globals|link|native-escape|navigation-state|session|stream-list|internal\/native-escape|internal\/session))?))$/,
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

function setBoundedCacheEntry<K, V>(
  cache: Map<K, V>,
  key: K,
  value: V,
  maxEntries: number,
  counters: RouterRuntimeCacheCounters,
): void {
  if (cache.size >= maxEntries) {
    const oldestKey = cache.keys().next().value as K | undefined;

    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
      counters.evictions += 1;
    }
  }

  cache.set(key, value);
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
