import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createAppRouterImportPolicyPlugin } from "../src/import-policy.js";

interface Resolution {
  errors?: Array<{ text: string }>;
  external?: boolean;
  path?: string;
}

function makePlugin(appDir: string, options: Parameters<typeof createAppRouterImportPolicyPlugin>[0]) {
  const plugin = createAppRouterImportPolicyPlugin(options);
  let onResolve: ((args: { path: string; resolveDir: string }) => Resolution | undefined) | undefined;
  plugin.setup({
    onResolve(_, callback) {
      onResolve = callback;
    },
  });
  if (onResolve === undefined) throw new Error("plugin did not register onResolve");
  return (path: string, resolveDir: string = appDir): Resolution | undefined =>
    onResolve!({ path, resolveDir });
}

describe("createAppRouterImportPolicyPlugin", () => {
  const appDir = join(process.cwd(), "fixture-app");

  test("bare builtin specifiers are marked external", () => {
    const resolve = makePlugin(appDir, { appDir, label: "server" });
    expect(resolve("fs")).toEqual({ external: true, path: "fs" });
    expect(resolve("path")).toEqual({ external: true, path: "path" });
  });

  test("node:-prefixed specifiers are accepted via the protocol-import branch", () => {
    const resolve = makePlugin(appDir, { appDir, label: "server" });
    // `node:fs` matches the protocol regex so the plugin lets esbuild handle it.
    expect(resolve("node:fs")).toBeUndefined();
  });

  test("relative imports inside the app directory are allowed", () => {
    const resolve = makePlugin(appDir, { appDir, label: "server" });
    expect(resolve("./local.ts")).toBeUndefined();
  });

  test("relative imports that escape the app directory are rejected", () => {
    const resolve = makePlugin(appDir, { appDir, label: "server" });
    const result = resolve("../escape.ts", appDir);
    expect(result?.errors?.[0]?.text).toContain("imports must stay inside the app directory");
  });

  test("relative imports can leave routesDir when they stay inside an allowed source directory", () => {
    const projectRoot = join(process.cwd(), "fixture-project");
    const routesDir = join(projectRoot, "src", "app");
    const resolve = makePlugin(routesDir, {
      allowedSourceDirs: [join(projectRoot, "src")],
      appDir: routesDir,
      label: "server",
      projectRoot,
    });

    expect(resolve("../lib/title.ts", routesDir)).toBeUndefined();
  });

  test("relative imports outside configured source directories are rejected", () => {
    const projectRoot = join(process.cwd(), "fixture-project");
    const routesDir = join(projectRoot, "src", "app");
    const resolve = makePlugin(routesDir, {
      allowedSourceDirs: [join(projectRoot, "src")],
      appDir: routesDir,
      label: "server",
      projectRoot,
    });
    const result = resolve("../../secrets.ts", routesDir);

    expect(result?.errors?.[0]?.text).toContain("allowed source directories");
  });

  test("absolute / protocol imports pass through", () => {
    const resolve = makePlugin(appDir, { appDir, label: "server" });
    expect(resolve("/absolute/path.js")).toBeUndefined();
    expect(resolve("https://cdn.example.com/lib.js")).toBeUndefined();
  });

  test("disallowed package imports return an error", () => {
    const resolve = makePlugin(appDir, { appDir, label: "server" });
    const result = resolve("lodash");
    expect(result?.errors?.[0]?.text).toContain("package imports are not allowed");
  });

  test("scoped package names are detected correctly in the error message", () => {
    const resolve = makePlugin(appDir, { appDir, label: "client" });
    const result = resolve("@scope/lib");
    expect(result?.errors?.[0]?.text).toContain('"@scope/lib"');
  });

  test("explicitly-allowed packages are accepted", () => {
    const resolve = makePlugin(appDir, {
      appDir,
      label: "server",
      importPolicy: { allowedPackages: ["allowed-pkg"] },
    });
    expect(resolve("allowed-pkg")).toBeUndefined();
  });

  test("@reckona/mreact-router is rewritten to the in-repo index.ts", () => {
    const resolve = makePlugin(appDir, { appDir, label: "server" });
    const result = resolve("@reckona/mreact-router");
    expect(result?.path).toMatch(/router\/src\/index\.ts$/);
  });

  test("resolveDir outside the app directory is ignored for package imports", () => {
    const resolve = makePlugin(appDir, { appDir, label: "server" });
    expect(resolve("lodash", "/elsewhere")).toBeUndefined();
  });

  test("relative imports from outside resolveDir baseDir fall back to undefined", () => {
    const resolve = makePlugin(appDir, { appDir, label: "server" });
    expect(resolve("./inside", "/somewhere-else")).toBeUndefined();
  });
});
