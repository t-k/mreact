import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as ts from "typescript";
import { describe, expect, test } from "vitest";

describe("react-compat JSX runtime types", () => {
  test("supports TypeScript automatic JSX runtime imports", () => {
    const directory = mkdtempSync(join(tmpdir(), "mreact-jsx-types-"));
    const filename = join(directory, "App.tsx");

    writeFileSync(
      filename,
      `
export function App() {
  return <button className="primary">Save</button>;
}
`,
    );

    try {
      const program = ts.createProgram({
        rootNames: [filename],
        options: {
          baseUrl: resolve(process.cwd()),
          jsx: ts.JsxEmit.ReactJSX,
          jsxImportSource: "@modular-react/react-compat",
          ignoreDeprecations: "6.0",
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          noEmit: true,
          paths: {
            "@modular-react/react-compat/jsx-runtime": [
              "packages/react-compat/src/jsx-runtime.ts",
            ],
            "@modular-react/react-compat/jsx-dev-runtime": [
              "packages/react-compat/src/jsx-dev-runtime.ts",
            ],
            "@modular-react/react-compat": [
              "packages/react-compat/src/index.ts",
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
});

function flattenDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(
    diagnostic.messageText,
    "\n",
  );

  return `${diagnostic.code}: ${message}`;
}
