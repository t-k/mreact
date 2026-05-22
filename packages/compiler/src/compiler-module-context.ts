import { parseSync } from "oxc-parser";

export interface CompilerModuleContext {
  code: string;
  filename: string;
  parseErrors: readonly unknown[];
  program: unknown;
}

export function createCompilerModuleContextWithOxc(input: {
  code: string;
  filename?: string | undefined;
}): CompilerModuleContext {
  const filename = input.filename ?? "module.tsx";
  const parsed = parseSync(filename, input.code, {
    astType: "ts",
    lang: compilerModuleContextLanguage(filename),
    sourceType: "module",
  });

  return {
    code: input.code,
    filename,
    parseErrors: parsed.errors,
    program: parsed.program,
  };
}

function compilerModuleContextLanguage(filename: string): "ts" | "tsx" {
  return /\.(?:cts|mts|ts)$/i.test(filename) ? "ts" : "tsx";
}
