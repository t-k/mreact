import { analyzeModule } from "./analyze.js";
import { emitClient } from "./emit-client.js";
import { emitCompat } from "./emit-compat.js";
import { emitServer } from "./emit-server.js";
import { unsupportedCompatServerTargetDiagnostic } from "./diagnostics.js";
import { parseSource } from "./parse.js";
import type { TransformInput, TransformOutput } from "./types.js";

export function transform(input: TransformInput): TransformOutput {
  const sourceFile = parseSource(input.code, input.filename);
  const mode = input.mode ?? "reactive";
  const analyzed = analyzeModule(
    sourceFile,
    mode === "compat" ? "client" : input.target,
  );
  const diagnostics = [...analyzed.diagnostics];
  const emitted =
    mode === "compat" && input.target === "server"
      ? {
          code: "",
          imports: [],
        }
      : mode === "compat"
        ? emitCompat(analyzed.ir)
        : input.target === "server"
          ? emitServer(analyzed.ir)
          : emitClient(analyzed.ir);

  if (mode === "compat" && input.target === "server") {
    diagnostics.push(unsupportedCompatServerTargetDiagnostic());
  }

  return {
    code: emitted.code,
    diagnostics,
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
