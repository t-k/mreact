import type { Diagnostic } from "./types.js";

export function unsupportedTargetDiagnostic(target: string): Diagnostic {
  return {
    level: "error",
    code: "MR_UNSUPPORTED_TARGET",
    message: `Compile target '${target}' is not supported in Phase 3.`,
  };
}
