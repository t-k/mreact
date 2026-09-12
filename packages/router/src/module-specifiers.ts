import { parse } from "es-module-lexer/js";

interface StaticModuleSpecifier {
  readonly end: number;
  readonly specifier: string;
  readonly start: number;
}

function staticModuleSpecifierSpans(code: string): readonly StaticModuleSpecifier[] {
  const [imports] = parse(code);

  return imports.flatMap((entry) =>
    entry.d === -1 && entry.n !== undefined
      ? [{ end: entry.e, specifier: entry.n, start: entry.s }]
      : [],
  );
}

export function staticModuleSpecifiers(code: string): readonly string[] {
  return staticModuleSpecifierSpans(code).map(({ specifier }) => specifier);
}

export function rewriteStaticModuleSpecifiers(
  code: string,
  replacementFor: (specifier: string) => string | undefined,
): string {
  let rewritten = code;

  for (const { end, specifier, start } of [...staticModuleSpecifierSpans(code)].reverse()) {
    const replacement = replacementFor(specifier);

    if (replacement !== undefined) {
      rewritten = `${rewritten.slice(0, start)}${replacement}${rewritten.slice(end)}`;
    }
  }

  return rewritten;
}
