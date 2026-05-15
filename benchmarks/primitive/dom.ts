import { Window as HappyDomWindow } from "happy-dom";
import type { BenchmarkDomContext } from "./types.js";

export function createBenchmarkDom(): BenchmarkDomContext {
  const window = new HappyDomWindow();
  const document = window.document as unknown as Document;
  const NodeConstructor = window.Node as unknown as typeof Node;

  globalThis.window = window as unknown as Window & typeof globalThis;
  globalThis.document = document;
  globalThis.Node = NodeConstructor;

  return {
    document,
    Node: NodeConstructor,
  };
}
