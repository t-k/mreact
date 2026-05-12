import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build as bundle } from "esbuild";
import { runnerImport, type InlineConfig } from "vite";

const runnerConfig = {
  configFile: false,
  logLevel: "silent",
} satisfies InlineConfig;
let fileImportVersion = 0;

export async function importAppRouterSourceModule<T>(
  options: {
    code: string;
    label: string;
    resolveDir?: string | undefined;
    sourcefile?: string | undefined;
  },
): Promise<T> {
  const code = options.resolveDir === undefined
    ? options.code
    : await bundleAppRouterSourceModule(options);
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
      loader: "js",
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
  const entries = new Map([
    [
      "@modular-react/reactive-core",
      join(packagesDir, "reactive-core", sourceOrDist),
    ],
    ["@modular-react/server", join(packagesDir, "server", sourceOrDist)],
    ["@modular-react/app-router", join(packageRoot, sourceOrDist)],
  ]);

  return {
    name: "mreact-app-router-workspace-packages",
    setup(buildApi: {
      onResolve(
        options: { filter: RegExp },
        callback: (args: { path: string }) => { path: string } | undefined,
      ): void;
    }) {
      buildApi.onResolve({ filter: /^@modular-react\/(?:reactive-core|server|app-router)$/ }, (args) => {
        const path = entries.get(args.path);

        return path === undefined ? undefined : { path };
      });
    },
  };
}
