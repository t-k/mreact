import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as ts from "@typescript/typescript6";
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
      const diagnostics = collectTypeDiagnostics(filename, {
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: "@reckona/mreact-compat",
      });

      expect(diagnostics).toEqual([]);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  test("does not merge compat elements into React's global JSX namespace", () => {
    const directory = mkdtempSync(join(tmpdir(), "mreact-react-jsx-types-"));
    const filename = join(directory, "App.tsx");

    writeFileSync(
      filename,
      `
import { createElement } from "@reckona/mreact-compat";
import type { FC } from "react";

const ThirdParty: FC<{ label: string }> = ({ label }) => <span>{label}</span>;
export const view = <ThirdParty label="compatible" />;
export const compatNode = createElement("span", null, "compat");
`,
    );

    try {
      const diagnostics = collectTypeDiagnostics(filename, {
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: "react",
      });

      expect(diagnostics).toEqual([]);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  test("accepts nested createElement nodes with heterogeneous props", () => {
    const directory = mkdtempSync(join(tmpdir(), "mreact-create-element-types-"));
    const filename = join(directory, "App.ts");

    writeFileSync(
      filename,
      `
import { createElement, type ReactCompatNode } from "@reckona/mreact-compat";

type RowData = {
  id: number;
  label: string;
  danger: boolean;
};

function Label(props: { value: string }) {
  return createElement("span", { className: "label" }, props.value);
}

export function row(row: RowData, onSelect: (id: number) => void): ReactCompatNode {
  return createElement(
    "tr",
    { className: row.danger ? "danger" : "" },
    createElement("td", { className: "col-md-1" }, row.id),
    createElement(
      "td",
      { className: "col-md-4" },
      createElement(
        "a",
        { onClick: () => onSelect(row.id) },
        createElement(Label, { value: row.label }),
      ),
    ),
  );
}

createElement(Label, { value: "ok" });
// @ts-expect-error component props remain validated at the top-level createElement call.
createElement(Label, { label: "wrong" });
`,
    );

    try {
      const diagnostics = collectTypeDiagnostics(filename);

      expect(diagnostics).toEqual([]);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  test("accepts component props interfaces without a Record intersection", () => {
    const directory = mkdtempSync(join(tmpdir(), "mreact-create-element-props-"));
    const filename = join(directory, "App.ts");

    writeFileSync(
      filename,
      `
import { createElement, memo } from "@reckona/mreact-compat";

interface RowData {
  id: number;
  label: string;
}

interface RowProps {
  readonly row: RowData;
  readonly selected: boolean;
}

function Row(props: RowProps) {
  return createElement("tr", { className: props.selected ? "danger" : "" }, props.row.label);
}

const MemoRow = memo(Row, (previous, next) => previous.row === next.row && previous.selected === next.selected);
const row = { id: 1, label: "Ada" };

createElement(Row, { row, selected: true });
createElement(MemoRow, { key: row.id, row, selected: false });
// @ts-expect-error required props remain enforced.
createElement(Row, { row });
// @ts-expect-error invalid prop names remain rejected.
createElement(MemoRow, { row, selected: true, missing: "nope" });
`,
    );

    try {
      const diagnostics = collectTypeDiagnostics(filename);

      expect(diagnostics).toEqual([]);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});

function collectTypeDiagnostics(
  filename: string,
  options: Pick<ts.CompilerOptions, "jsx" | "jsxImportSource"> = {},
): string[] {
  const program = ts.createProgram({
    rootNames: [filename],
    options: {
      baseUrl: resolve(process.cwd()),
      ...options,
      ignoreDeprecations: "6.0",
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      paths: {
        react: ["node_modules/@types/react/index.d.ts"],
        "react/jsx-runtime": ["node_modules/@types/react/jsx-runtime.d.ts"],
        "@reckona/mreact-compat/jsx-runtime": ["packages/react-compat/src/jsx-runtime.ts"],
        "@reckona/mreact-compat/jsx-dev-runtime": ["packages/react-compat/src/jsx-dev-runtime.ts"],
        "@reckona/mreact-compat": ["packages/react-compat/src/index.ts"],
      },
      strict: true,
      target: ts.ScriptTarget.ES2022,
      types: [],
    },
  });

  return ts.getPreEmitDiagnostics(program).map((diagnostic) => flattenDiagnostic(diagnostic));
}

function flattenDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");

  return `${diagnostic.code}: ${message}`;
}
