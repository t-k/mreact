import type { BenchmarkRow } from "../shared/types.js";

export interface BenchmarkDomContext {
  document: Document;
  Node: typeof Node;
}

export interface PrimitiveRunContext extends BenchmarkDomContext {
  count: number;
}

export interface PrimitiveCaseResult {
  samples: number[];
  notes?: string[];
}

export type PrimitiveCase = (
  context: PrimitiveRunContext,
) => Promise<PrimitiveCaseResult> | PrimitiveCaseResult;

export interface PrimitiveAdapter {
  name: "react" | "solid" | "mreact";
  version: string;
  cases: Partial<Record<PrimitiveCaseName, PrimitiveCase>>;
  bundleEntry?: string;
}

export type PrimitiveCaseName =
  | "create 1k rows"
  | "update every 10th in 10k rows"
  | "keyed reverse 1k rows"
  | "text binding update 1k";

export interface PrimitiveCaseDefinition {
  name: PrimitiveCaseName;
  count: number;
  metric: BenchmarkRow["metric"];
  unit: BenchmarkRow["unit"];
}
