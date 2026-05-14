import type { Diagnostic } from "@reckona/mreact-compiler";

export function formatDiagnostic(
  filename: string,
  diagnostic: Diagnostic,
): string {
  const loc =
    diagnostic.loc === undefined
      ? ""
      : `:${diagnostic.loc.line}:${diagnostic.loc.column}`;

  return `${filename}${loc} [${diagnostic.code}] ${diagnostic.message}`;
}
