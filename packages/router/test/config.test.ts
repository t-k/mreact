import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveAppRouterProjectOptions } from "../src/config.js";

describe("router project config", () => {
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
