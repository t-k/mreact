import { Window } from "happy-dom";
import type { BenchmarkDomContext } from "./types.js";

export function createBenchmarkDom(): BenchmarkDomContext {
  const window = new Window();
  globalThis.window = window as unknown as Window & typeof globalThis;
  globalThis.document = window.document;
  globalThis.Node = window.Node;

  return {
    document: window.document,
    Node: window.Node,
  };
}
