import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as ts from "typescript";
import { describe, expect, test } from "vitest";

describe("router package entrypoints", () => {
  test("exposes stable session and native escape subpaths for workspace integrations", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages", "router", "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(manifest.exports).toHaveProperty("./session");
    expect(manifest.exports).toHaveProperty("./native-escape");
  });

  test("exposes app-router global types for Slot layouts", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages", "router", "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(manifest.exports).toHaveProperty("./app-router-globals");
  });

  test("app-router global types include Await for shared stream components", () => {
    const directory = mkdtempSync(join(process.cwd(), "node_modules", ".tmp-mreact-types-"));
    const filename = join(directory, "Shared.tsx");

    writeFileSync(
      filename,
      `
export function Shared(props: { name: Promise<string> }) {
  return (
    <Await value={props.name} placeholder={<em>loading</em>}>
      {(value) => <strong>{value.toUpperCase()}</strong>}
    </Await>
  );
}
`,
    );

    try {
      const program = ts.createProgram({
        rootNames: [
          filename,
          join(process.cwd(), "packages", "router", "src", "app-router-globals.ts"),
        ],
        options: {
          baseUrl: process.cwd(),
          jsx: ts.JsxEmit.ReactJSX,
          jsxImportSource: "@reckona/mreact-compat",
          ignoreDeprecations: "6.0",
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          noEmit: true,
          paths: {
            "@reckona/mreact-compat": ["packages/react-compat/src/index.ts"],
            "@reckona/mreact-compat/jsx-runtime": [
              "packages/react-compat/src/jsx-runtime.ts",
            ],
            "@reckona/mreact-compat/jsx-dev-runtime": [
              "packages/react-compat/src/jsx-dev-runtime.ts",
            ],
          },
          strict: true,
          target: ts.ScriptTarget.ES2022,
          types: [],
        },
      });
      const diagnostics = ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) => flattenDiagnostic(diagnostic));

      expect(diagnostics).toEqual([]);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  test("exposes modular client helper subpaths", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages", "router", "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(manifest.exports).toHaveProperty("./link");
    expect(manifest.exports).toHaveProperty("./navigation-state");
  });
});

function flattenDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");

  return `${diagnostic.code}: ${message}`;
}
