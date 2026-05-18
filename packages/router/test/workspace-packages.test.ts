import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { resolveWorkspacePackageFile, workspacePackageFile } from "../src/workspace-packages.js";

describe("router workspace package path helpers", () => {
  const root = "/repo";

  test("resolves sibling packages in the monorepo source layout", () => {
    expect(
      workspacePackageFile({
        currentFileUrl: pathToFileURL(join(root, "packages/router/src/module-runner.ts")).href,
        entry: "index",
        monorepoDir: "query",
        packageName: "@reckona/mreact-query",
      }),
    ).toBe(join(root, "packages/query/src/index.ts"));
  });

  test("resolves sibling packages in the monorepo dist layout", () => {
    expect(
      workspacePackageFile({
        currentFileUrl: pathToFileURL(join(root, "packages/router/dist/module-runner.js")).href,
        entry: "index",
        monorepoDir: "query",
        packageName: "@reckona/mreact-query",
      }),
    ).toBe(join(root, "packages/query/dist/index.js"));
  });

  test("resolves scoped package folders in a published node_modules layout", () => {
    expect(
      workspacePackageFile({
        currentFileUrl: pathToFileURL(
          join(root, "node_modules/@reckona/mreact-router/dist/module-runner.js"),
        ).href,
        entry: "index",
        monorepoDir: "query",
        packageName: "@reckona/mreact-query",
      }),
    ).toBe(join(root, "node_modules/@reckona/mreact-query/dist/index.js"));
  });

  test("resolves package subpath files in a published node_modules layout", () => {
    expect(
      workspacePackageFile({
        currentFileUrl: pathToFileURL(
          join(root, "node_modules/@reckona/mreact-router/dist/module-runner.js"),
        ).href,
        entry: "jsx-runtime",
        monorepoDir: "react-compat",
        packageName: "@reckona/mreact-compat",
      }),
    ).toBe(join(root, "node_modules/@reckona/mreact-compat/dist/jsx-runtime.js"));
  });

  test("resolves published transitive package imports from the importing package directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-workspace-published-"));
    const currentFileUrl = pathToFileURL(
      join(root, "node_modules/@reckona/mreact-router/dist/module-runner.js"),
    ).href;
    const queryDist = join(root, "node_modules/@reckona/mreact-query/dist");
    const reactiveCoreDir = join(
      root,
      "node_modules/@reckona/mreact-query/node_modules/@reckona/mreact-reactive-core",
    );
    await mkdir(join(reactiveCoreDir, "dist"), { recursive: true });
    await writeFile(
      join(reactiveCoreDir, "package.json"),
      JSON.stringify({
        exports: { ".": { default: "./dist/index.js" } },
        name: "@reckona/mreact-reactive-core",
        type: "module",
      }),
    );
    await writeFile(join(reactiveCoreDir, "dist", "index.js"), "export const ok = true;");

    expect(
      resolveWorkspacePackageFile({
        currentFileUrl,
        entry: "index",
        monorepoDir: "reactive-core",
        packageName: "@reckona/mreact-reactive-core",
        resolveDir: queryDist,
        specifier: "@reckona/mreact-reactive-core",
      }),
    ).toBe(join(reactiveCoreDir, "dist/index.js"));
  });
});
