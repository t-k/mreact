import { analyzeModule } from "./analyze.js";
import { emitClient } from "./emit-client.js";
import { emitServer } from "./emit-server.js";
import { parseSource } from "./parse.js";
import type { TransformInput, TransformOutput } from "./types.js";

export function transform(input: TransformInput): TransformOutput {
  const sourceFile = parseSource(input.code, input.filename);
  const analyzed = analyzeModule(sourceFile);
  const emitted =
    input.target === "server"
      ? emitServer(analyzed.ir)
      : emitClient(analyzed.ir);

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
