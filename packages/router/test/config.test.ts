import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveAppRouterProjectOptions } from "../src/config.js";

describe("router project config", () => {
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
