import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { workspacePackageFile } from "../src/workspace-packages.js";

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
});
