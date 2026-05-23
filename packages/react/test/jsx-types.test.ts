import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as ts from "typescript";
import { describe, expect, test } from "vitest";

describe("react JSX runtime types", () => {
  test("exposes JSX.Element for component return annotations", () => {
    const diagnostics = compileApp(`
export default function Page(): JSX.Element {
  return <main>Dashboard</main>;
}
`);

    expect(diagnostics).toEqual([]);
  });

  test("types form submit handlers with the form as currentTarget", () => {
    const diagnostics = compileApp(`
import type { FormEvent } from "@reckona/mreact";

const submit = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const form: HTMLFormElement = event.currentTarget;
  new FormData(form);
};

export default function Page(): JSX.Element {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form: HTMLFormElement = event.currentTarget;
        new FormData(form);
      }}
    >
      <button type="submit" onClick={() => undefined}>Save</button>
      <button type="submit" onClick={undefined}>Skip</button>
      <button type="submit" onClick={(event) => event.currentTarget.disabled = true}>Disable</button>
      <button type="submit">Save</button>
    </form>
  );
}

export function TypedPage(): JSX.Element {
  return <form onSubmit={submit} />;
}
`);

    expect(diagnostics).toEqual([]);
  });
});

function compileApp(source: string): string[] {
  const directory = mkdtempSync(join(tmpdir(), "mreact-react-jsx-types-"));
  const filename = join(directory, "App.tsx");

  writeFileSync(filename, source);

  try {
    const program = ts.createProgram({
      rootNames: [filename],
      options: {
        baseUrl: resolve(process.cwd()),
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: "@reckona/mreact",
        ignoreDeprecations: "6.0",
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        noEmit: true,
        paths: {
          "@reckona/mreact/jsx-runtime": [
            "packages/react/src/jsx-runtime.ts",
          ],
          "@reckona/mreact/jsx-dev-runtime": [
            "packages/react/src/jsx-dev-runtime.ts",
          ],
          "@reckona/mreact": [
            "packages/react/src/index.ts",
          ],
          "@reckona/mreact-compat/jsx-runtime": [
            "packages/react-compat/src/jsx-runtime.ts",
          ],
          "@reckona/mreact-compat/jsx-dev-runtime": [
            "packages/react-compat/src/jsx-dev-runtime.ts",
          ],
          "@reckona/mreact-compat": [
            "packages/react-compat/src/index.ts",
          ],
        },
        strict: true,
        target: ts.ScriptTarget.ES2022,
        types: [],
      },
    });

    return ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => flattenDiagnostic(diagnostic));
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function flattenDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(
    diagnostic.messageText,
    "\n",
  );

  return `${diagnostic.code}: ${message}`;
}
