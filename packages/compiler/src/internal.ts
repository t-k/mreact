import type { ModuleIr } from "./ir.js";
import { analyzeModule, type AnalyzeModuleOptions } from "./analyze.js";
import { parseSource } from "./parse.js";
import type { CompileTarget, Diagnostic } from "./types.js";

export interface AnalyzeToIrInput {
  code: string;
  filename: string;
  target: CompileTarget;
  options?: AnalyzeModuleOptions;
}

export interface AnalyzeToIrOutput {
  ir: ModuleIr;
  diagnostics: Diagnostic[];
}

export function analyzeToIr(input: AnalyzeToIrInput): AnalyzeToIrOutput {
  return analyzeModule(
    parseSource(input.code, input.filename),
    input.target,
    input.options,
  );
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
