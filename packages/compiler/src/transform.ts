import { unsupportedTargetDiagnostic } from "./diagnostics.js";
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

  return {
    code: input.code,
    diagnostics: [],
    metadata: {
      filename: input.filename,
      target: input.target,
      components: [],
      imports: [],
    },
  };
}
