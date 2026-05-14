import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const packageNames = {
  auth: "@reckona/mreact-auth",
  compiler: "@reckona/mreact-compiler",
  devtools: "@reckona/mreact-devtools",
  forms: "@reckona/mreact-forms",
  next: "@reckona/mreact-next",
  query: "@reckona/mreact-query",
  "react-compat": "@reckona/mreact-compat",
  react: "@reckona/mreact",
  "react-dom": "@reckona/mreact-dom",
  "reactive-core": "@reckona/mreact-reactive-core",
  "reactive-dom": "@reckona/mreact-reactive-dom",
  "router-native": "@reckona/mreact-router-native",
  "router-native-darwin-arm64": "@reckona/mreact-router-native-darwin-arm64",
  "router-native-linux-x64-gnu": "@reckona/mreact-router-native-linux-x64-gnu",
  "router-native-win32-x64-msvc": "@reckona/mreact-router-native-win32-x64-msvc",
  router: "@reckona/mreact-router",
  scheduler: "@reckona/mreact-scheduler",
  server: "@reckona/mreact-server",
  store: "@reckona/mreact-store",
  "test-utils": "@reckona/mreact-test-utils",
  "vite-plugin": "@reckona/mreact-vite",
} as const;
const oldPackageScope = `@${"modular-react"}/`;

describe("package namespace", () => {
  for (const [dir, expectedName] of Object.entries(packageNames)) {
    test(`${dir} uses the @reckona mreact package name`, async () => {
      const source = await readFile(join(process.cwd(), "packages", dir, "package.json"), "utf8");
      const manifest = JSON.parse(source) as { name?: string };

      expect(manifest.name).toBe(expectedName);
      expect(source).not.toContain(oldPackageScope);
    });
  }
});
