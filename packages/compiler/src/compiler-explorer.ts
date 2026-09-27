import { transform } from "./transform.js";
import type {
  ClientSpecializationMetadata,
  ComponentMetadata,
  Diagnostic,
  RuntimeImport,
  SourceLocation,
  TransformInput,
} from "./types.js";

/** One client emitter decision with a stable reason code and an optional source position. */
export interface CompilerDecision {
  kind: "client-specialization";
  name: ClientSpecializationMetadata["name"];
  applied: boolean;
  helper: string;
  reason: NonNullable<ClientSpecializationMetadata["reason"]> | "applied" | "unknown";
  source: SourceLocation | null;
}

/** A diagnostic normalized for JSON consumers. */
export interface CompilerReportDiagnostic {
  code: Diagnostic["code"];
  level: Diagnostic["level"];
  message: Diagnostic["message"];
  source: SourceLocation | null;
  suggestion?: Diagnostic["suggestion"];
}

/** A versioned compiler report for an editor or diagnostic tool. */
export interface CompilerDecisionReport {
  schemaVersion: 1;
  filename: string;
  target: TransformInput["target"];
  mode: "reactive" | "compat";
  generated: {
    code: string;
    sourceMap: string;
    sourceMapAccuracy: "heuristic";
  };
  components: ComponentMetadata[];
  runtimeImports: RuntimeImport[];
  decisions: CompilerDecision[];
  diagnostics: CompilerReportDiagnostic[];
}

/** Compiles once and returns source decisions alongside emitted code and its heuristic source map. */
export function explainTransform(input: TransformInput): CompilerDecisionReport {
  const output = transform({ ...input, reportClientSpecializations: true, sourceMap: true });

  return {
    schemaVersion: 1,
    filename: input.filename,
    target: input.target,
    mode: input.mode === "compat" ? "compat" : "reactive",
    generated: {
      code: output.code,
      sourceMap: output.map!,
      sourceMapAccuracy: "heuristic",
    },
    components: output.metadata.components,
    runtimeImports: output.metadata.imports,
    decisions: (output.metadata.clientSpecializations ?? []).map((decision) => ({
      kind: "client-specialization",
      name: decision.name,
      applied: decision.applied,
      helper: decision.helper,
      reason: decision.reason ?? (decision.applied ? "applied" : "unknown"),
      source: decision.loc ?? null,
    })),
    diagnostics: output.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      level: diagnostic.level,
      message: diagnostic.message,
      source: diagnostic.loc ?? null,
      ...(diagnostic.suggestion === undefined ? {} : { suggestion: diagnostic.suggestion }),
    })),
  };
}
