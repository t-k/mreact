import { analyzeModule } from "./analyze.js";
import { unsupportedTargetDiagnostic } from "./diagnostics.js";
import { emitClient } from "./emit-client.js";
import { parseSource } from "./parse.js";
import type { TransformInput, TransformOutput } from "./types.js";

export function transform(input: TransformInput): TransformOutput {
  if (input.target !== "client") {
    return {
      code: "",
      diagnostics: [unsupportedTargetDiagnostic(input.target)],
      metadata: {
        filename: input.filename,
        target: input.target,
        components: [],
        imports: [],
      },
    };
  }

  const sourceFile = parseSource(input.code, input.filename);
  const analyzed = analyzeModule(sourceFile);
  const emitted = emitClient(analyzed.ir);

  return {
    code: emitted.code,
    diagnostics: analyzed.diagnostics,
    metadata: {
      filename: input.filename,
      target: input.target,
      components: analyzed.ir.components.map((component) => ({
        name: component.name,
        exportName: component.exportName,
      })),
      imports: emitted.imports,
    },
  };
}
