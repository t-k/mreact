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
  name: "marko" | "qwik" | "qwik-v2" | "react" | "mreact react-compat" | "solid" | "solid-v2" | "mreact";
  version: string;
  cases: Partial<Record<PrimitiveCaseName, PrimitiveCase>>;
  bundleEntry?: string;
}

export type PrimitiveCaseName =
  | "create 1k rows"
  | "replace all 1k rows"
  | "update every 10th in 10k rows"
  | "select row in 10k rows"
  | "append 1k rows to 10k rows"
  | "remove row from 1k rows"
  | "clear 10k rows"
  | "keyed reverse 1k rows"
  | "create 1k event targets"
  | "source write with subscriber 1k"
  | "text binding update 1k"
  | "computed fan-out 1k"
  | "computed fan-in 1k"
  | "source write 1k"
  | "repeated create update clear memory";

export interface PrimitiveCaseDefinition {
  name: PrimitiveCaseName;
  description: string;
  count: number;
  metric: BenchmarkRow["metric"];
  unit: BenchmarkRow["unit"];
}
