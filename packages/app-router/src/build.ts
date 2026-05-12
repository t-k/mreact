import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { transform } from "@modular-react/compiler";
import {
  buildClientRouteOutput,
  clientScriptForPath,
  isClientRouteSource,
  routeIdForPath,
  type ClientRouteManifestEntry,
} from "./client.js";
import { stripRevalidateExport } from "./cache.js";
import { scanAppRoutes } from "./routes.js";
import type { AppRoute } from "./routes.js";

export interface BuildAppOptions {
  appDir: string;
  outDir: string;
}

export interface BuildAppResult {
  routes: AppRoute[];
}

export interface BuiltServerManifest {
  version: 1;
  files: Record<string, string>;
  routes: AppRoute[];
}

export async function buildApp(options: BuildAppOptions): Promise<BuildAppResult> {
  const routes = await scanAppRoutes({ appDir: options.appDir });
  const serverDir = join(options.outDir, "server");
  const clientDir = join(options.outDir, "client");

  await validateProductionRoutes(routes);

  await rm(options.outDir, { force: true, recursive: true });
  await mkdir(serverDir, { recursive: true });
  await mkdir(clientDir, { recursive: true });
  await mkdir(join(clientDir, "assets", "routes"), { recursive: true });

  const files = await collectBuildFiles(options.appDir);
  const serverRoutes = routes.map((route) => ({
    ...route,
    file: relative(options.appDir, route.file),
  }));
  const clientRoutes = await Promise.all(
    routes.map((route) => writeClientRouteBundle(route, clientDir)),
  );

  await writeFile(
    join(serverDir, "manifest.json"),
    JSON.stringify({ version: 1, routes: serverRoutes, files } satisfies BuiltServerManifest, null, 2),
  );
  await writeFile(
    join(clientDir, "manifest.json"),
    JSON.stringify({ routes: clientRoutes }, null, 2),
  );

  return { routes };
}

async function writeClientRouteBundle(
  route: AppRoute,
  clientDir: string,
): Promise<ClientRouteManifestEntry> {
  if (route.kind === "server") {
    return { path: route.path, kind: route.kind, client: false };
  }

  const source = await readFile(route.file, "utf8");

  if (!isClientRouteSource(source)) {
    return { path: route.path, kind: route.kind, client: false };
  }

  const output = await buildClientRouteOutput({
    code: source,
    filename: route.file,
    minify: true,
    routePath: route.path,
    sourceMap: true,
  });

  const routeId = routeIdForPath(route.path);
  const hash = createHash("sha256")
    .update(output.code)
    .update(output.map ?? "")
    .digest("hex")
    .slice(0, 8);
  const script = `assets/routes/${routeId}.${hash}.js`;
  const sourceMap = `${script}.map`;
  const scriptBasename = script.split("/").pop() ?? "route.js";
  const codeWithSourceMap = output.code.replace(
    /\/\/# sourceMappingURL=route\.js\.map\s*$/,
    `//# sourceMappingURL=${scriptBasename}.map`,
  );
  const code = output.map === undefined || codeWithSourceMap.includes("sourceMappingURL=")
    ? codeWithSourceMap
    : `${codeWithSourceMap}\n//# sourceMappingURL=${scriptBasename}.map`;

  await mkdir(dirname(join(clientDir, script)), { recursive: true });
  await writeFile(join(clientDir, script), code);
  if (output.map !== undefined) {
    await writeFile(join(clientDir, sourceMap), output.map);
  }

  return {
    bytes: Buffer.byteLength(code),
    path: route.path,
    kind: route.kind,
    client: true,
    routeId,
    script,
    sourceMap,
    devScript: clientScriptForPath(route.path),
  };
}

async function validateProductionRoutes(routes: AppRoute[]): Promise<void> {
  for (const route of routes) {
    if (route.kind !== "page") {
      continue;
    }

    const source = await readFile(route.file, "utf8");
    const output = transform({
      code: stripBuildRouteExports(source),
      dev: false,
      filename: route.file,
      serverOutput: isStreamRouteSource(source) ? "stream" : "string",
      target: "server",
    });
    const fatalDiagnostics = output.diagnostics.filter(
      (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
    );

    if (fatalDiagnostics.length > 0) {
      throw new Error(
        `${route.file}: ${fatalDiagnostics
          .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
          .join("\n")}`,
      );
    }
  }
}

function stripBuildRouteExports(code: string): string {
  return stripLoaderExport(
    stripRevalidateExport(code.replace(/^\s*export\s+const\s+stream\s*=\s*true\s*;?\s*$/m, "")),
  );
}

function isStreamRouteSource(code: string): boolean {
  return /^\s*export\s+const\s+stream\s*=\s*true\s*;?/m.test(code);
}

function stripLoaderExport(code: string): string {
  return code
    .replace(
      /export\s+(?:async\s+)?function\s+loader\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*\{[\s\S]*?^\}\s*/m,
      "",
    )
    .replace(
      /export\s+const\s+loader\s*=\s*(?:async\s+)?\([^)]*\)(?:\s*:\s*[^=]+)?\s*=>\s*[\s\S]*?;?\s*(?=\nexport|\n$)/m,
      "",
    );
}

async function collectBuildFiles(appDir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  for (const file of await collectFiles(appDir)) {
    files[relative(appDir, file)] = await readFile(file, "utf8");
  }

  return files;
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
      continue;
    }

    if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}
