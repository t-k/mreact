import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const rootDir = process.cwd();

async function readPackageJson(relativePath: string): Promise<{
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}> {
  return JSON.parse(await readFile(join(rootDir, relativePath), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

describe("workspace dependency separation", () => {
  test("keeps benchmark comparison frameworks and compat-lab UI libraries out of root devDependencies", async () => {
    const rootPkg = await readPackageJson("package.json");
    const rootDevDeps = Object.keys(rootPkg.devDependencies ?? {});

    const forbiddenRootPrefixes = [
      "@analogjs/",
      "@angular/",
      "@builder.io/qwik",
      "@qwik.dev/",
      "@radix-ui/",
      "@sveltejs/",
      "@vue/",
      "@floating-ui/",
      "@headlessui/",
      "@tanstack/react-virtual",
      "@xyflow/",
    ];
    const forbiddenRootNames = new Set([
      "marko",
      "next",
      "nuxt",
      "react-aria-components",
      "react-hook-form",
      "recharts",
      "rxjs",
      "solid-js",
      "solid-js-2",
      "svelte",
      "tinybench",
      "vue",
      "zone.js",
    ]);

    for (const dep of rootDevDeps) {
      expect(forbiddenRootNames.has(dep), `${dep} should not be in root devDependencies`).toBe(false);
      expect(
        forbiddenRootPrefixes.some((prefix) => dep.startsWith(prefix)),
        `${dep} should not be in root devDependencies`,
      ).toBe(false);
    }
  });

  test("declares separated benchmark and compat-lab workspaces with their respective dependencies", async () => {
    const [benchmarksPkg, compatLabPkg, rootWorkspace, benchWorkspace, compatWorkspace] =
      await Promise.all([
        readPackageJson("benchmarks/package.json"),
        readPackageJson("compat-lab/package.json"),
        readFile(join(rootDir, "pnpm-workspace.yaml"), "utf8"),
        readFile(join(rootDir, "benchmarks/pnpm-workspace.yaml"), "utf8"),
        readFile(join(rootDir, "compat-lab/pnpm-workspace.yaml"), "utf8"),
      ]);

    expect(rootWorkspace).not.toContain("benchmarks");
    expect(rootWorkspace).not.toContain("compat-lab");
    expect(benchWorkspace).toContain('"."');
    expect(compatWorkspace).toContain('"."');

    expect(benchmarksPkg.devDependencies).toEqual(
      expect.objectContaining({
        "@angular/core": expect.any(String),
        "@builder.io/qwik": expect.any(String),
        marko: expect.any(String),
        next: expect.any(String),
        nuxt: expect.any(String),
        "solid-js": expect.any(String),
        svelte: expect.any(String),
        vue: expect.any(String),
      }),
    );

    expect(compatLabPkg.devDependencies).toEqual(
      expect.objectContaining({
        "@radix-ui/react-dialog": expect.any(String),
        "@xyflow/react": expect.any(String),
        "react-aria-components": expect.any(String),
        recharts: expect.any(String),
      }),
    );
  });

  test("keeps vitest configs disjoint and wires benchmark configs for CI and Stryker", async () => {
    const [coreConfig, benchConfig, compatConfig, strykerHttp, benchWorkflow] = await Promise.all([
      import("../vitest.config.js").then((mod) => mod.default),
      import("../vitest.benchmarks.config.js").then((mod) => mod.default),
      import("../vitest.compat-lab.config.js").then((mod) => mod.default),
      import("../config/stryker/stryker.router-http.config.mjs").then((mod) => mod.default),
      readFile(join(rootDir, ".github/workflows/benchmarks.yml"), "utf8"),
    ]);

    expect(coreConfig.test?.include).not.toContain("benchmarks/**/*.test.ts");
    expect(coreConfig.test?.include).not.toContain("compat-lab/**/*.test.ts");
    expect(benchConfig.test?.include).toEqual(["benchmarks/**/*.test.ts"]);
    expect(compatConfig.test?.include).toEqual(["compat-lab/**/*.test.ts"]);
    expect(strykerHttp.vitest?.configFile).toBe("vitest.benchmarks.config.ts");
    expect(benchWorkflow).toContain(
      "vitest run --config vitest.benchmarks.config.ts benchmarks/router/adapters/http-production.integration.test.ts benchmarks/router/fixture-server.test.ts",
    );
    expect(benchWorkflow).toContain(
      "if [ -f benchmarks/package.json ]; then pnpm setup:benchmarks; fi",
    );
  });
});
