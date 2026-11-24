import { transform } from "./transform.js";
import type {
  ClientSpecializationMetadata,
  CompatLoweringMetadata,
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
  compatLowering: CompatLoweringMetadata[];
  diagnostics: CompilerReportDiagnostic[];
}

/** Compiles once and returns source decisions alongside emitted code and its heuristic source map. */
export function explainTransform(input: TransformInput): CompilerDecisionReport {
  const mode = input.mode === "compat" ? "compat" : "reactive";
  const output = transform({
    ...input,
    reportClientSpecializations: true,
    reportCompatLowering: mode === "compat" && input.target === "client",
    sourceMap: true,
  });

  return {
    schemaVersion: 1,
    filename: input.filename,
    target: input.target,
    mode,
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
    compatLowering: output.metadata.compatLowering ?? [],
    diagnostics: output.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      level: diagnostic.level,
      message: diagnostic.message,
      source: diagnostic.loc ?? null,
      ...(diagnostic.suggestion === undefined ? {} : { suggestion: diagnostic.suggestion }),
    })),
  };
}

/** Formats a compat lowering report into human-readable lines highlighting VDOM fallbacks. */
export function formatCompatLoweringReport(
  filename: string,
  entries: readonly CompatLoweringMetadata[],
): string {
  const lines = [`Compat lowering: ${filename}`];

  if (entries.length === 0) {
    lines.push("  (no compat components)");
    return `${lines.join("\n")}\n`;
  }

  let optimizedCount = 0;
  let fallbackCount = 0;

  for (const entry of entries) {
    if (entry.optimized) {
      optimizedCount += 1;
    }
    if (entry.fallback) {
      fallbackCount += 1;
    }

    const loc = entry.loc === undefined ? "" : ` (${entry.loc.line}:${entry.loc.column})`;
    const status = entry.optimized ? "optimized" : "VDOM fallback";
    const reasonSummary = entry.reasons.length === 0 ? "" : ` [${entry.reasons.join(", ")}]`;
    lines.push(`  ${entry.component}${loc}: ${entry.path} (${status})${reasonSummary}`);

    if (entry.runtimeImports.length > 0) {
      const formattedImports = entry.runtimeImports
        .map((item) => `${item.source} { ${item.specifiers.join(", ")} }`)
        .join("; ");
      lines.push(`    runtime: ${formattedImports}`);
    }

    for (const detail of entry.details ?? []) {
      lines.push(`    reason: ${detail}`);
    }

    for (const suggestion of entry.suggestions ?? []) {
      lines.push(`    hint: ${suggestion}`);
    }
  }

  lines.push(
    `Summary: ${optimizedCount} optimized, ${fallbackCount} VDOM fallback${fallbackCount === 1 ? "" : "s"}`,
  );

  return `${lines.join("\n")}\n`;
}

/** Formats a complete compiler decision report for terminal inspection. */
export function formatCompilerDecisionReport(report: CompilerDecisionReport): string {
  const lines = [
    `Compiler report: ${report.filename} (mode: ${report.mode}, target: ${report.target})`,
  ];

  if (report.mode === "compat" && report.target === "client") {
    lines.push(formatCompatLoweringReport(report.filename, report.compatLowering).trimEnd());
  } else if (report.decisions.length > 0) {
    lines.push("Client specializations:");
    for (const decision of report.decisions) {
      const loc =
        decision.source === null ? "" : ` (${decision.source.line}:${decision.source.column})`;
      const status = decision.applied ? "applied" : `generic (${decision.reason})`;
      lines.push(`  ${decision.name}${loc}: ${decision.helper} [${status}]`);
    }
  } else {
    lines.push("Decisions: none");
  }

  if (report.runtimeImports.length > 0) {
    lines.push("Runtime imports:");
    for (const runtimeImport of report.runtimeImports) {
      lines.push(`  ${runtimeImport.source}: ${runtimeImport.specifiers.join(", ")}`);
    }
  }

  if (report.diagnostics.length > 0) {
    lines.push("Diagnostics:");
    for (const diagnostic of report.diagnostics) {
      const loc =
        diagnostic.source === null ? "" : `:${diagnostic.source.line}:${diagnostic.source.column}`;
      lines.push(`  [${diagnostic.level}] ${diagnostic.code}${loc}: ${diagnostic.message}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
