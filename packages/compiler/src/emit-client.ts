import type { ModuleIr } from "./ir.js";
import type { RuntimeImport } from "./types.js";

export interface EmitResult {
  code: string;
  imports: RuntimeImport[];
}

export function emitClient(ir: ModuleIr): EmitResult {
  return {
    code: ir.components
      .map(
        (component) =>
          `import { createTemplate } from "@modular-react/reactive-dom";\n` +
          `const _tmpl_${component.name} = createTemplate("<div id=\\"app\\">Hello</div>");\n` +
          `export function ${component.name}() {\n` +
          `  const _fragment = _tmpl_${component.name}();\n` +
          `  return _fragment.firstChild;\n` +
          `}\n`,
      )
      .join("\n"),
    imports: [
      {
        source: "@modular-react/reactive-dom",
        specifiers: ["createTemplate"],
      },
    ],
  };
}
