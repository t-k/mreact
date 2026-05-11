import type { ModuleIr } from "./ir.js";
import { analyzeWithOxc } from "./oxc.js";
import type { AnalyzeModuleOptions, CompileTarget, Diagnostic } from "./types.js";

export interface AnalyzeToIrInput {
  code: string;
  filename: string;
  target: CompileTarget;
  options?: AnalyzeModuleOptions;
}

export interface AnalyzeToIrOutput {
  ir: ModuleIr;
  diagnostics: Diagnostic[];
  usedTypescriptFallback?: boolean;
}

export function analyzeToIr(input: AnalyzeToIrInput): AnalyzeToIrOutput {
  return analyzeWithOxc(input);
}

export type {
  AsyncBoundaryIr,
  AttributeIr,
  ComponentIr,
  ComponentPropIr,
  ComponentRefIr,
  ConditionalIr,
  DynamicAttributeIr,
  EventAttributeIr,
  ExprIr,
  JsxElementIr,
  JsxFragmentIr,
  JsxNodeIr,
  ListIr,
  ModuleIr,
  SpreadAttributeIr,
  StaticAttributeIr,
  TextIr,
} from "./ir.js";
