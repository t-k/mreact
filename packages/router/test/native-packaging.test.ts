import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { nativeModulePackageCandidates } from "../src/native-route-matcher.js";

describe("router native package distribution metadata", () => {
  test("keeps platform native packages out of local workspace project discovery", async () => {
    const workspace = await readFile(join(process.cwd(), "pnpm-workspace.yaml"), "utf8");

    expect(workspace).toContain("!packages/router-native-darwin-arm64");
    expect(workspace).toContain("!packages/router-native-linux-x64-gnu");
    expect(workspace).toContain("!packages/router-native-win32-x64-msvc");
  });

  test("wrapper package declares optional platform packages and CI builds native artifacts", async () => {
    const nativePackage = JSON.parse(
      await readFile(join(process.cwd(), "packages/router-native/package.json"), "utf8"),
    ) as { optionalDependencies?: Record<string, string> };
    const ci = await readFile(join(process.cwd(), ".github/workflows/ci.yml"), "utf8");

    expect(nativePackage.optionalDependencies).toMatchObject({
      "@reckona/mreact-router-native-darwin-arm64": "workspace:*",
      "@reckona/mreact-router-native-linux-x64-gnu": "workspace:*",
      "@reckona/mreact-router-native-win32-x64-msvc": "workspace:*",
    });
    expect(nativeModulePackageCandidates("linux", "x64")).toEqual([
      "@reckona/mreact-router-native-linux-x64-gnu",
      "@reckona/mreact-router-native",
    ]);
    expect(ci).toContain("native-artifacts");
    expect(ci).toContain("packages/router-native");
  });

  test("native packages expose typed CommonJS entrypoints", async () => {
    for (const packageDir of [
      "router-native",
      "router-native-darwin-arm64",
      "router-native-linux-x64-gnu",
      "router-native-win32-x64-msvc",
    ]) {
      const manifest = JSON.parse(
        await readFile(join(process.cwd(), "packages", packageDir, "package.json"), "utf8"),
      ) as {
        exports?: { ".": { default?: string; require?: string; types?: string } };
        files?: string[];
        main?: string;
        types?: string;
      };

      expect(manifest.main).toBe("./index.cjs");
      expect(manifest.types).toBe("./index.d.ts");
      expect(manifest.exports?.["."]).toEqual({
        types: "./index.d.ts",
        require: "./index.cjs",
        default: "./index.cjs",
      });
      expect(manifest.files).toContain("index.d.ts");
      await expect(access(join(process.cwd(), "packages", packageDir, "index.d.ts"))).resolves.toBeUndefined();
    }
  });

  test("publish workflow validates staged native packages before publishing", async () => {
    const publish = await readFile(join(process.cwd(), ".github/workflows/publish.yml"), "utf8");
    const script = await readFile(
      join(process.cwd(), "scripts", "verify-native-packages.mjs"),
      "utf8",
    );

    expect(publish).toContain("node scripts/verify-native-packages.mjs");
    expect(publish.indexOf("node scripts/verify-native-packages.mjs")).toBeLessThan(
      publish.indexOf("node scripts/publish-packages.mjs"),
    );
    expect(script).toContain("router-native-linux-x64-gnu");
    expect(script).toContain("NativeRouteMatcher");
  });

  test("native artifact jobs skip unrelated dependency lifecycle scripts", async () => {
    for (const workflowName of ["ci.yml", "publish.yml"]) {
      const workflow = await readFile(
        join(process.cwd(), ".github/workflows", workflowName),
        "utf8",
      );
      const nativeJob = workflow.slice(workflow.indexOf("  native-artifacts:"));

      expect(nativeJob).toContain("pnpm install --frozen-lockfile --ignore-scripts");
    }
  });
});
