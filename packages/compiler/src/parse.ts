import * as ts from "typescript";

export function parseSource(code: string, filename: string): ts.SourceFile {
  return ts.createSourceFile(
    filename,
    code,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX,
  );
}

export function printNode(sourceFile: ts.SourceFile, node: ts.Node): string {
  const printer = ts.createPrinter({ removeComments: false });
  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
}

export function printJavaScriptNode(sourceFile: ts.SourceFile, node: ts.Node): string {
  return transpileTypeScriptSnippet(printNode(sourceFile, node));
}

export function printCompatJsxJavaScriptNode(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): string {
  return transpileCompatJsxTypeScriptSnippet(printNode(sourceFile, node));
}

export function transpileTypeScriptSnippet(code: string): string {
  return ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      removeComments: false,
      verbatimModuleSyntax: true,
      alwaysStrict: false,
      noImplicitUseStrict: true,
    },
  }).outputText.trimEnd();
}

function transpileCompatJsxTypeScriptSnippet(code: string): string {
  return ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      jsxImportSource: "@modular-react/react-compat",
      removeComments: false,
      verbatimModuleSyntax: true,
      alwaysStrict: false,
      noImplicitUseStrict: true,
    },
  }).outputText.trimEnd();
}
