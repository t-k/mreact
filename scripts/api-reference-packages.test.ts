import { describe, expect, test } from "vitest";
import {
  adapterApiForgottenExports,
  apiExtractorConfigForEntry,
  apiReportFileName,
  collectPackageApiEntries,
  packageSlug,
} from "./api-reference-packages.mjs";

describe("API reference package discovery", () => {
  test("collects root and public subpath type entry points", () => {
    const entries = collectPackageApiEntries("packages/router", {
      name: "@reckona/mreact-router",
      private: false,
      types: "./dist/index.d.ts",
      exports: {
        ".": {
          types: "./dist/index.d.ts",
          default: "./dist/index.js",
        },
        "./adapters/aws-lambda": {
          types: "./dist/adapters/aws-lambda.d.ts",
          default: "./dist/adapters/aws-lambda.js",
        },
        "./internal/session": {
          types: "./dist/session.d.ts",
          default: "./dist/session.js",
        },
      },
    });

    expect(entries).toEqual([
      {
        displayName: "@reckona/mreact-router",
        entryPoint: "packages/router/dist/index.d.ts",
        exportPath: ".",
        packageDir: "packages/router",
        packageName: "@reckona/mreact-router",
      },
      {
        displayName: "@reckona/mreact-router/adapters/aws-lambda",
        entryPoint: "packages/router/dist/adapters/aws-lambda.d.ts",
        exportPath: "./adapters/aws-lambda",
        packageDir: "packages/router",
        packageName: "@reckona/mreact-router",
      },
    ]);
  });

  test("generates stable report filenames for scoped packages and subpaths", () => {
    expect(packageSlug("@reckona/mreact-router")).toBe("reckona-mreact-router");
    expect(apiReportFileName("@reckona/mreact-router", ".")).toBe("reckona-mreact-router.api.md");
    expect(apiReportFileName("@reckona/mreact-router", "./adapters/aws-lambda")).toBe(
      "reckona-mreact-router__adapters__aws-lambda.api.md",
    );
  });

  test("builds API Extractor configs for one export entry", () => {
    const config = apiExtractorConfigForEntry("/repo", "etc/api", {
      displayName: "@reckona/mreact-router/adapters/aws-lambda",
      entryPoint: "packages/router/dist/adapters/aws-lambda.d.ts",
      exportPath: "./adapters/aws-lambda",
      packageDir: "packages/router",
      packageName: "@reckona/mreact-router",
    });

    expect(config.mainEntryPointFilePath).toBe(
      "/repo/packages/router/dist/adapters/aws-lambda.d.ts",
    );
    expect(config.projectFolder).toBe("/repo/packages/router");
    expect(config.apiReport.reportFolder).toBe("/repo/etc/api");
    expect(config.apiReport.reportFileName).toBe(
      "reckona-mreact-router__adapters__aws-lambda.api.md",
    );
    expect(config.messages.extractorMessageReporting["ae-missing-release-tag"].logLevel).toBe(
      "none",
    );
  });

  test("rejects forgotten exports in public router adapter reports", () => {
    expect(
      adapterApiForgottenExports(
        "@reckona/mreact-router/adapters/aws-lambda",
        '// Warning: (ae-forgotten-export) The symbol "AppRouterCache" needs to be exported',
      ),
    ).toEqual(["AppRouterCache"]);
    expect(
      adapterApiForgottenExports(
        "@reckona/mreact-router",
        '// Warning: (ae-forgotten-export) The symbol "LegacyType" needs to be exported',
      ),
    ).toEqual([]);
    expect(
      adapterApiForgottenExports(
        "@reckona/mreact-router/adapters/node",
        "// no forgotten exports",
      ),
    ).toEqual([]);
  });
});
