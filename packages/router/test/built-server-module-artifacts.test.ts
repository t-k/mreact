import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  allBuiltServerModuleFiles,
  loadBuiltServerModuleArtifactsForRequest,
  type BuiltServerModuleArtifactRuntime,
} from "../src/built-server-module-artifacts.js";

type MutableArtifactRuntime = Omit<
  BuiltServerModuleArtifactRuntime,
  "serverModuleFiles" | "serverModuleRenderFiles" | "serverModuleRequestFiles" | "serverSourceFiles"
> & {
  serverModuleFiles: Map<string, string>;
  serverModuleRenderFiles: Map<string, string>;
  serverModuleRequestFiles: Map<string, string>;
  serverSourceFiles: Map<string, string>;
};

function createRuntime(appDir: string): MutableArtifactRuntime {
  return {
    appDir,
    serverModuleArtifactLoads: new Map(),
    serverModuleClosureFiles: new Map(),
    serverModuleFiles: new Map(),
    serverModuleRenderFiles: new Map(),
    serverModuleRequestFiles: new Map(),
    serverModules: new Map(),
    serverSourceFiles: new Map(),
  };
}

describe("built server module artifact loading", () => {
  test("loads request artifacts from manifest closure files without source fallback", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-built-server-artifacts-"));
    const appDir = join(rootDir, "app");
    const serverDir = join(rootDir, "server");
    const codeDir = join(serverDir, "server-modules", "code");
    const requestDir = join(serverDir, "server-modules", "request");
    await mkdir(codeDir, { recursive: true });
    await mkdir(requestDir, { recursive: true });
    await writeFile(join(codeDir, "page.mjs"), "export const page = true;");
    await writeFile(
      join(requestDir, "page.json"),
      JSON.stringify({
        loader: { moduleFile: "server-modules/code/page.mjs", sourceHash: "page" },
      }),
    );
    await writeFile(
      join(requestDir, "dep.json"),
      JSON.stringify({ request: { code: "export const dep = true;", sourceHash: "dep" } }),
    );

    const pageFile = join(appDir, "page.tsx");
    const depFile = join(appDir, "server", "dep.ts");
    const runtime = createRuntime(appDir);
    runtime.serverModuleClosureFiles.set(pageFile, [pageFile, depFile]);
    runtime.serverModuleRequestFiles.set(pageFile, join(requestDir, "page.json"));
    runtime.serverModuleRequestFiles.set(depFile, join(requestDir, "dep.json"));

    await loadBuiltServerModuleArtifactsForRequest(runtime, pageFile, {
      includeShells: false,
    });

    expect(runtime.serverModules.get(pageFile)?.loader?.moduleFile).toBe(
      join(serverDir, "server-modules", "code", "page.mjs"),
    );
    expect(runtime.serverModules.get(depFile)?.request?.code).toContain("dep = true");
  });

  test("falls back to source import closure when manifest closure files are absent", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-built-server-artifacts-source-fallback-"));
    const appDir = join(rootDir, "app");
    const serverDir = join(rootDir, "server");
    const requestDir = join(serverDir, "server-modules", "request");
    await mkdir(requestDir, { recursive: true });
    await writeFile(
      join(requestDir, "page.json"),
      JSON.stringify({ loader: { code: "export function loader() {}", sourceHash: "page" } }),
    );
    await writeFile(
      join(requestDir, "dep.json"),
      JSON.stringify({ request: { code: "export const dep = true;", sourceHash: "dep" } }),
    );

    const pageFile = join(appDir, "page.tsx");
    const depFile = join(appDir, "server", "dep.ts");
    const runtime = createRuntime(appDir);
    runtime.serverSourceFiles.set(pageFile, `import { dep } from "./server/dep"; export { dep };`);
    runtime.serverSourceFiles.set(depFile, "export const dep = true;");
    runtime.serverModuleRequestFiles.set(pageFile, join(requestDir, "page.json"));
    runtime.serverModuleRequestFiles.set(depFile, join(requestDir, "dep.json"));

    await loadBuiltServerModuleArtifactsForRequest(runtime, pageFile, {
      includeShells: false,
    });

    expect(runtime.serverModules.get(pageFile)?.loader?.code).toContain("loader");
    expect(runtime.serverModules.get(depFile)?.request?.code).toContain("dep = true");
    expect(runtime.serverModuleClosureFiles.get(pageFile)).toEqual([pageFile, depFile]);
  });

  test("enumerates split and unsplit server module files once", () => {
    const rootDir = join(tmpdir(), "mreact-built-server-artifact-enumerate");
    const runtime = createRuntime(join(rootDir, "app"));
    runtime.serverModuleFiles.set(join(rootDir, "app", "layout.tsx"), "layout.json");
    runtime.serverModuleRequestFiles.set(join(rootDir, "app", "page.tsx"), "page-request.json");
    runtime.serverModuleRenderFiles.set(join(rootDir, "app", "page.tsx"), "page-render.json");

    expect([...allBuiltServerModuleFiles(runtime)].sort()).toEqual([
      join(rootDir, "app", "layout.tsx"),
      join(rootDir, "app", "page.tsx"),
    ]);
  });
});
