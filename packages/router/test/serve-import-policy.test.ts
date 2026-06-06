import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import { renderBuiltAppRequest } from "../src/serve.js";

describe("built server import policy", () => {
  let rootDir: string;
  let appDir: string;
  let outDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "mreact-built-import-policy-"));
    appDir = join(rootDir, "app");
    outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(rootDir, { force: true, recursive: true });
  });

  test("uses generated runtime packages when bundling built server component source", async () => {
    await writeFile(
      join(rootDir, "package.json"),
      JSON.stringify({ dependencies: { "fixture-runtime-title": "1.0.0" } }),
    );
    await writeFakePackage(
      rootDir,
      "fixture-runtime-title",
      'export function title() { return "Generated policy OK"; }\n',
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { title } from "fixture-runtime-title";

export default function Page() {
  return <main>{title()}</main>;
}
`,
    );
    await buildApp({
      allowedSourceDirs: ["app"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["node"],
    });
    const serverManifestFile = join(outDir, "server", "manifest.json");
    const serverManifest = JSON.parse(await readFile(serverManifestFile, "utf8")) as {
      serverModuleRenderFiles?: Record<string, string>;
    };
    await writeFile(
      serverManifestFile,
      JSON.stringify({
        ...serverManifest,
        serverModuleRenderFiles: {},
      }),
    );
    await writeFile(
      join(outDir, "server", "import-policy.json"),
      JSON.stringify({
        byRoute: {},
        runtimePackages: [],
        version: 1,
      }),
    );

    const blockedResponse = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const blockedText = await blockedResponse.text();
    expect(blockedResponse.status, blockedText).toBe(500);
    expect(blockedText).toBe("Internal Server Error");
    await writeFile(
      join(outDir, "server", "import-policy.json"),
      JSON.stringify({
        byRoute: {},
        runtimePackages: ["fixture-runtime-title"],
        version: 1,
      }),
    );

    const response = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const text = await response.text();

    expect(response.status, text).toBe(200);
    expect(text).toContain("<main>Generated policy OK</main>");
  });
});

async function writeFakePackage(
  rootDir: string,
  name: string,
  source: string,
): Promise<void> {
  const packageDir = join(rootDir, "node_modules", name);

  await mkdir(packageDir, { recursive: true });
  await writeFile(
    join(packageDir, "package.json"),
    JSON.stringify({ exports: "./index.js", name, type: "module", version: "1.0.0" }),
  );
  await writeFile(join(packageDir, "index.js"), source);
}
