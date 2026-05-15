import { Window as HappyDomWindow } from "happy-dom";
import type { BenchmarkDomContext } from "./types.js";

export function createBenchmarkDom(): BenchmarkDomContext {
  const window = new HappyDomWindow();
  const document = window.document as unknown as Document;
  const NodeConstructor = window.Node as unknown as typeof Node;

  globalThis.window = window as unknown as Window & typeof globalThis;
  globalThis.document = document;
  globalThis.Node = NodeConstructor;
  globalThis.Element = window.Element as unknown as typeof Element;
  globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement;
  globalThis.Comment = window.Comment as unknown as typeof Comment;
  globalThis.CustomEvent = window.CustomEvent as unknown as typeof CustomEvent;

  return {
    document,
    Node: NodeConstructor,
  };
}
