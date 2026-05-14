import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { nativeModulePackageCandidates } from "../src/native-route-matcher.js";

describe("router native package distribution metadata", () => {
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
});
