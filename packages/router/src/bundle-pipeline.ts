import { builtinModules } from "node:module";
import { dirname } from "node:path";
import {
  build as viteBuild,
  type InlineConfig,
  type PluginOption,
  type Plugin as VitePlugin,
} from "vite";
import { workspacePackageFile } from "./workspace-packages.js";

export interface RouterBundleOptions {
  base?: string | undefined;
  code: string;
  define?: Record<string, string> | undefined;
  filename: string;
  minify?: boolean | undefined;
  outfile?: string | undefined;
  platform: "browser" | "node";
  preserveExports?: boolean | undefined;
  plugins?: readonly RouterCompatPlugin[] | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
  sourceMap?: boolean | undefined;
  target?: string | undefined;
}

export interface RouterBundleModulesOptions {
  base?: string | undefined;
  define?: Record<string, string> | undefined;
  entries: readonly RouterBundleEntryOptions[];
  minify?: boolean | undefined;
  platform: "browser" | "node";
  plugins?: readonly RouterCompatPlugin[] | undefined;
  root?: string | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
  sourceMap?: boolean | undefined;
  target?: string | undefined;
}

export interface RouterBundleEntryOptions {
  code: string;
  filename: string;
  name: string;
}

export interface RouterBundleOutput {
  assets?: RouterBundleAssetOutput[] | undefined;
  code: string;
  map?: string | undefined;
}

export interface RouterBundleModulesOutput {
  assets?: RouterBundleAssetOutput[] | undefined;
  chunks: RouterBundleChunkOutput[];
}

export interface RouterBundleChunkOutput {
  code: string;
  fileName: string;
  imports: string[];
  isEntry: boolean;
  map?: string | undefined;
  name: string;
}

export interface RouterBundleAssetOutput {
  fileName: string;
  source: string | Uint8Array;
}

interface RouterBundlerChunk {
  code: string;
  fileName: string;
  imports?: string[] | undefined;
  isEntry?: boolean | undefined;
  name?: string | undefined;
  type: "chunk";
}

interface RouterBundlerAsset {
  fileName: string;
  source: string | Uint8Array;
  type: "asset";
}

interface RouterBundlerOutput {
  output: Array<RouterBundlerAsset | RouterBundlerChunk>;
}

export interface RouterCompatPlugin {
  name: string;
  setup(buildApi: RouterCompatBuildApi): void;
}

export interface RouterCompatBuildApi {
  onLoad(
    options: { filter: RegExp; namespace?: string | undefined },
    callback: (args: { path: string }) => RouterCompatLoadResult | Promise<RouterCompatLoadResult>,
  ): void;
  onResolve(
    options: { filter: RegExp },
    callback: (args: {
      importer?: string | undefined;
      path: string;
      resolveDir: string;
    }) => RouterCompatResolveResult | Promise<RouterCompatResolveResult>,
  ): void;
}

export type RouterCompatLoadResult =
  | {
      contents: string;
      loader?: string | undefined;
      resolveDir?: string | undefined;
    }
  | undefined;

export type RouterCompatResolveResult =
  | {
      errors?: Array<{ text: string }> | undefined;
      external?: boolean | undefined;
      namespace?: string | undefined;
      path?: string | undefined;
    }
  | undefined;

const nodeBuiltinSpecifiers = new Set(
  builtinModules.flatMap((name) => [name, `node:${name}`]),
);

export async function bundleRouterModule(options: RouterBundleOptions): Promise<RouterBundleOutput> {
  const entryId = `${options.filename}?mreact-router-entry`;
  const outfile = options.outfile ?? "entry.js";
  const config = {
    base: options.base ?? "/",
    configFile: false,
    ...(options.define === undefined ? {} : { define: options.define }),
    logLevel: "silent",
    plugins: [
      rejectNodeBuiltinsForBrowserPlugin(options.platform),
      mreactJsxRuntimeAliasPlugin(),
      ...(options.vitePlugins ?? []),
      virtualEntryPlugin(entryId, options.code),
      ...(options.plugins ?? []).map(routerCompatPlugin),
    ],
    publicDir: false,
    root: dirname(options.filename),
    ssr: {
      noExternal: true,
    },
    build: {
      emptyOutDir: false,
      lib: options.preserveExports === true
        ? {
            entry: entryId,
            fileName: () => outfile,
            formats: ["es"],
          }
        : false,
      minify: options.minify === true,
      sourcemap: options.sourceMap === true,
      ssr: options.platform === "node",
      target: options.target ?? "es2022",
      write: false,
      rolldownOptions: {
        input: entryId,
        output: {
          codeSplitting: false,
          entryFileNames: outfile,
          format: "es",
        },
      },
    },
  } satisfies InlineConfig;
  const result = await viteBuild(config);
  const output = (Array.isArray(result) ? result[0] : result) as RouterBundlerOutput | undefined;

  if (output === undefined || !("output" in output)) {
    throw new Error(`Failed to bundle ${options.filename}: Vite/Rolldown produced no output.`);
  }

  const chunk = output.output.find((item): item is RouterBundlerChunk => item.type === "chunk");
  const map = output.output.find(
    (item): item is RouterBundlerAsset =>
      item.type === "asset" && item.fileName === `${chunk?.fileName ?? outfile}.map`,
  );
  const assets = output.output
    .filter((item): item is RouterBundlerAsset =>
      item.type === "asset" && item.fileName !== `${chunk?.fileName ?? outfile}.map`
    )
    .map((asset) => ({ fileName: asset.fileName, source: asset.source }));

  if (chunk === undefined) {
    throw new Error(`Failed to bundle ${options.filename}: Vite/Rolldown produced no chunk.`);
  }

  return {
    ...(assets.length === 0 ? {} : { assets }),
    code: stripSourceMappingUrl(chunk.code),
    ...(map !== undefined && typeof map.source === "string" ? { map: map.source } : {}),
  };
}

export async function bundleRouterModules(
  options: RouterBundleModulesOptions,
): Promise<RouterBundleModulesOutput> {
  if (options.entries.length === 0) {
    return { chunks: [] };
  }

  const entries = new Map(
    options.entries.map((entry) => [
      `${entry.filename}?mreact-router-entry=${encodeURIComponent(entry.name)}`,
      entry,
    ]),
  );
  const input = Object.fromEntries(
    Array.from(entries, ([entryId, entry]) => [entry.name, entryId]),
  );
  const config = {
    base: options.base ?? "/",
    configFile: false,
    ...(options.define === undefined ? {} : { define: options.define }),
    logLevel: "silent",
    plugins: [
      rejectNodeBuiltinsForBrowserPlugin(options.platform),
      mreactJsxRuntimeAliasPlugin(),
      ...(options.vitePlugins ?? []),
      virtualEntriesPlugin(entries),
      ...(options.plugins ?? []).map(routerCompatPlugin),
    ],
    publicDir: false,
    root: options.root ?? dirname(options.entries[0]?.filename ?? process.cwd()),
    ssr: {
      noExternal: true,
    },
    build: {
      emptyOutDir: false,
      minify: options.minify === true,
      sourcemap: options.sourceMap === true,
      ssr: options.platform === "node",
      target: options.target ?? "es2022",
      write: false,
      rolldownOptions: {
        input,
        output: {
          chunkFileNames: "assets/chunks/[name].[hash].js",
          entryFileNames: "assets/routes/[name].[hash].js",
          format: "es",
          hashCharacters: "hex",
        },
      },
    },
  } satisfies InlineConfig;
  const result = await viteBuild(config);
  const output = (Array.isArray(result) ? result[0] : result) as RouterBundlerOutput | undefined;

  if (output === undefined || !("output" in output)) {
    throw new Error("Failed to bundle client routes: Vite/Rolldown produced no output.");
  }

  const mapAssets = new Map(
    output.output
      .filter((item): item is RouterBundlerAsset =>
        item.type === "asset" && item.fileName.endsWith(".map")
      )
      .flatMap((asset) =>
        typeof asset.source === "string" ? [[asset.fileName, asset.source] as const] : []
      ),
  );
  const chunks = output.output
    .filter((item): item is RouterBundlerChunk => item.type === "chunk")
    .map((chunk) => {
      const map = mapAssets.get(`${chunk.fileName}.map`);

      return {
        code: stripSourceMappingUrl(chunk.code),
        fileName: chunk.fileName,
        imports: chunk.imports ?? [],
        isEntry: chunk.isEntry === true,
        ...(map === undefined ? {} : { map }),
        name: chunk.name ?? chunk.fileName,
      };
    });
  const assets = output.output
    .filter((item): item is RouterBundlerAsset =>
      item.type === "asset" && !item.fileName.endsWith(".map")
    )
    .map((asset) => ({ fileName: asset.fileName, source: asset.source }));

  return {
    ...(assets.length === 0 ? {} : { assets }),
    chunks,
  };
}

function mreactJsxRuntimeAliasPlugin(): VitePlugin {
  const runtimePaths = new Map([
    [
      "react/jsx-dev-runtime",
      workspacePackageFile({
        currentFileUrl: import.meta.url,
        entry: "jsx-dev-runtime",
        monorepoDir: "react",
        packageName: "@reckona/mreact",
      }),
    ],
    [
      "react/jsx-runtime",
      workspacePackageFile({
        currentFileUrl: import.meta.url,
        entry: "jsx-runtime",
        monorepoDir: "react",
        packageName: "@reckona/mreact",
      }),
    ],
  ]);

  return {
    name: "mreact-router-jsx-runtime-alias",
    enforce: "pre",
    resolveId(id) {
      return runtimePaths.get(id);
    },
  };
}

function stripSourceMappingUrl(code: string): string {
  return code.replace(/\n?\/\/# sourceMappingURL=[^\n]+\.map\s*$/u, "");
}

function virtualEntryPlugin(entryId: string, code: string): VitePlugin {
  return {
    name: "mreact-router-virtual-entry",
    enforce: "pre",
    resolveId(id) {
      return id === entryId ? entryId : undefined;
    },
    load(id) {
      return id === entryId ? { code, moduleType: moduleTypeForFilename(entryId) } : undefined;
    },
  };
}

function virtualEntriesPlugin(entries: ReadonlyMap<string, RouterBundleEntryOptions>): VitePlugin {
  return {
    name: "mreact-router-virtual-entries",
    enforce: "pre",
    resolveId(id) {
      return entries.has(id) ? id : undefined;
    },
    load(id) {
      const entry = entries.get(id);

      return entry === undefined ? undefined : { code: entry.code, moduleType: moduleTypeForFilename(id) };
    },
  };
}

function moduleTypeForFilename(filename: string): "js" | "jsx" | "ts" | "tsx" {
  const clean = cleanViteId(filename);

  if (/\.(?:mreact\.)?[cm]?tsx$/u.test(clean) || clean.endsWith(".jsx")) {
    return "tsx";
  }

  if (/\.(?:mreact\.)?[cm]?ts$/u.test(clean)) {
    return "ts";
  }

  return "js";
}

function rejectNodeBuiltinsForBrowserPlugin(platform: RouterBundleOptions["platform"]): VitePlugin {
  return {
    name: "mreact-router-browser-node-builtins",
    enforce: "pre",
    resolveId(id) {
      if (platform === "browser" && nodeBuiltinSpecifiers.has(id)) {
        this.error(`Browser build cannot import Node builtin ${JSON.stringify(id)}.`);
      }

      return undefined;
    },
  };
}

function routerCompatPlugin(plugin: RouterCompatPlugin): VitePlugin {
  const resolvers: Array<{
    filter: RegExp;
    callback: Parameters<RouterCompatBuildApi["onResolve"]>[1];
  }> = [];
  const loaders: Array<{
    filter: RegExp;
    namespace?: string | undefined;
    callback: Parameters<RouterCompatBuildApi["onLoad"]>[1];
  }> = [];

  plugin.setup({
    onLoad(options, callback) {
      loaders.push({ ...options, callback });
    },
    onResolve(options, callback) {
      resolvers.push({ ...options, callback });
    },
  });

  return {
    name: plugin.name,
    enforce: "pre",
    async resolveId(source, importer) {
      for (const resolver of resolvers) {
        if (!resolver.filter.test(source)) {
          continue;
        }

        const resolved = await resolver.callback({
          importer: importer === undefined ? undefined : cleanViteId(importer),
          path: source,
          resolveDir: importer === undefined ? "" : dirname(cleanViteId(importer)),
        });

        if (resolved === undefined) {
          continue;
        }

        if (resolved.errors !== undefined && resolved.errors.length > 0) {
          this.error(resolved.errors.map((error) => error.text).join("\n"));
        }

        if (resolved.path === undefined) {
          continue;
        }

        if (resolved.external === true) {
          return { external: true, id: resolved.path };
        }

        return resolved.namespace === undefined
          ? resolved.path
          : compatVirtualId(resolved.namespace, resolved.path);
      }

      return undefined;
    },
    async load(id) {
      const virtual = parseCompatVirtualId(id);
      const path = virtual?.path ?? cleanViteId(id);
      const namespace = virtual?.namespace;

      for (const loader of loaders) {
        if (loader.namespace !== namespace || !loader.filter.test(path)) {
          continue;
        }

        const loaded = await loader.callback({ path });

        if (loaded !== undefined) {
          return loaded.contents;
        }
      }

      return undefined;
    },
  };
}

function compatVirtualId(namespace: string, path: string): string {
  return `\0mreact-router-compat:${encodeURIComponent(namespace)}:${encodeURIComponent(path)}`;
}

function parseCompatVirtualId(id: string): { namespace: string; path: string } | undefined {
  const prefix = "\0mreact-router-compat:";

  if (!id.startsWith(prefix)) {
    return undefined;
  }

  const rest = id.slice(prefix.length);
  const separator = rest.indexOf(":");

  if (separator === -1) {
    return undefined;
  }

  return {
    namespace: decodeURIComponent(rest.slice(0, separator)),
    path: decodeURIComponent(rest.slice(separator + 1)),
  };
}

function cleanViteId(id: string): string {
  const withoutPrefix = id.startsWith("/@fs/") ? id.slice("/@fs".length) : id;
  const queryIndex = withoutPrefix.indexOf("?");

  return queryIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, queryIndex);
}
