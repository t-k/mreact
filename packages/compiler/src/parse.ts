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
