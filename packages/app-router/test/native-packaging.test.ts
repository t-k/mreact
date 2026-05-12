import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { nativeModulePackageCandidates } from "../src/native-route-matcher.js";

describe("app-router native package distribution metadata", () => {
  test("wrapper package declares optional platform packages and CI builds native artifacts", async () => {
    const nativePackage = JSON.parse(
      await readFile(join(process.cwd(), "packages/app-router-native/package.json"), "utf8"),
    ) as { optionalDependencies?: Record<string, string> };
    const ci = await readFile(join(process.cwd(), ".github/workflows/ci.yml"), "utf8");

    expect(nativePackage.optionalDependencies).toMatchObject({
      "@modular-react/app-router-native-darwin-arm64": "workspace:*",
      "@modular-react/app-router-native-linux-x64-gnu": "workspace:*",
      "@modular-react/app-router-native-win32-x64-msvc": "workspace:*",
    });
    expect(nativeModulePackageCandidates("linux", "x64")).toEqual([
      "@modular-react/app-router-native-linux-x64-gnu",
      "@modular-react/app-router-native",
    ]);
    expect(ci).toContain("native-artifacts");
    expect(ci).toContain("packages/app-router-native");
  });
});
