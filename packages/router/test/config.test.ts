import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveAppRouterProjectOptions } from "../src/config.js";

describe("router project config", () => {
  test("defaults production client source maps to none", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-router-config-sourcemaps-default-"));

    expect(resolveAppRouterProjectOptions({ projectRoot }).clientSourceMaps).toBe("none");
  });

  test("normalizes production client source map modes", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-router-config-sourcemaps-"));

    expect(
      resolveAppRouterProjectOptions({ projectRoot, clientSourceMaps: true }).clientSourceMaps,
    ).toBe("linked");
    expect(
      resolveAppRouterProjectOptions({ projectRoot, clientSourceMaps: false }).clientSourceMaps,
    ).toBe("none");
    expect(
      resolveAppRouterProjectOptions({ projectRoot, clientSourceMaps: "hidden" }).clientSourceMaps,
    ).toBe("hidden");
  });

  test("rejects unknown production client source map modes", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-router-config-sourcemaps-invalid-"));

    expect(() =>
      resolveAppRouterProjectOptions({
        projectRoot,
        clientSourceMaps: "inline" as never,
      }),
    ).toThrow(/clientSourceMaps/);
  });

  test("keeps configured asset base URLs on the resolved project", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-router-config-assets-"));

    expect(
      resolveAppRouterProjectOptions({
        assetBaseUrl: "https://cdn.example.com/_mreact/client/",
        projectRoot,
        publicAssetBaseUrl: "https://cdn.example.com/",
      }),
    ).toMatchObject({
      assetBaseUrl: "https://cdn.example.com/_mreact/client/",
      publicAssetBaseUrl: "https://cdn.example.com/",
    });
  });

  test("defaults allowed source directories to an explicit routesDir", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-router-config-routes-dir-"));

    expect(
      resolveAppRouterProjectOptions({
        projectRoot,
        routesDir: "app",
      }).allowedSourceDirs,
    ).toEqual([join(projectRoot, "app")]);
  });

  test("keeps the source root as the default allowed source directory for src/app routes", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-router-config-src-app-"));

    expect(
      resolveAppRouterProjectOptions({
        projectRoot,
        routesDir: "src/app",
      }).allowedSourceDirs,
    ).toEqual([join(projectRoot, "src")]);
  });

  test("rejects project paths that resolve outside projectRoot", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-router-config-root-"));
    const outside = await mkdtemp(join(tmpdir(), "mreact-router-config-outside-"));

    expect(() =>
      resolveAppRouterProjectOptions({
        projectRoot,
        publicDir: outside,
      }),
    ).toThrow(/publicDir.*projectRoot/);

    expect(() =>
      resolveAppRouterProjectOptions({
        allowedSourceDirs: ["../shared"],
        projectRoot,
      }),
    ).toThrow(/allowedSourceDirs.*projectRoot/);

    expect(() =>
      resolveAppRouterProjectOptions({
        projectRoot,
        routesDir: "../app",
      }),
    ).toThrow(/routesDir.*projectRoot/);
  });
});
