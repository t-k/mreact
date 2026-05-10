import type { ReactCompatNode } from "./element.js";
import type { RootRuntime } from "./hooks.js";
import type { RenderOptions } from "./hydration.js";

export interface ReconcileResult {
  nodes: Node[];
  consumed: number;
}

export type ReconcileNode = (
  parent: ParentNode,
  previousNodes: readonly Node[],
  node: ReactCompatNode,
  runtime: RootRuntime,
  path: string,
  options?: RenderOptions,
) => ReconcileResult;

export type ReconcileSequence = (
  parent: ParentNode,
  previousNodes: readonly Node[],
  children: ReactCompatNode[],
  runtime: RootRuntime,
  path: string,
  options?: RenderOptions,
) => ReconcileResult;
