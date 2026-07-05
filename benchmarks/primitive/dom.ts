import { Window as HappyDomWindow } from "happy-dom";
import type { BenchmarkDomContext } from "./types.js";

type ClosableHappyDomWindow = HappyDomWindow & {
  happyDOM?: {
    abort?: () => void;
    close?: () => Promise<void> | void;
  };
};

let activeWindow: ClosableHappyDomWindow | undefined;

export function createBenchmarkDom(): BenchmarkDomContext {
  closeBenchmarkDom();

  const window = new HappyDomWindow() as ClosableHappyDomWindow;
  const document = window.document as unknown as Document;
  const NodeConstructor = window.Node as unknown as typeof Node;
  activeWindow = window;

  globalThis.window = window as unknown as Window & typeof globalThis;
  globalThis.document = document;
  globalThis.Node = NodeConstructor;
  globalThis.Element = window.Element as unknown as typeof Element;
  globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement;
  globalThis.SVGElement = window.SVGElement as unknown as typeof SVGElement;
  globalThis.Comment = window.Comment as unknown as typeof Comment;
  globalThis.Text = window.Text as unknown as typeof Text;
  globalThis.HTMLInputElement = window.HTMLInputElement as unknown as typeof HTMLInputElement;
  globalThis.HTMLTextAreaElement =
    window.HTMLTextAreaElement as unknown as typeof HTMLTextAreaElement;
  globalThis.HTMLSelectElement = window.HTMLSelectElement as unknown as typeof HTMLSelectElement;
  globalThis.HTMLOptionElement = window.HTMLOptionElement as unknown as typeof HTMLOptionElement;
  globalThis.CustomEvent = window.CustomEvent as unknown as typeof CustomEvent;

  return {
    document,
    Node: NodeConstructor,
  };
}

export async function closeBenchmarkDom(): Promise<void> {
  const window = activeWindow;

  if (window === undefined) {
    return;
  }

  activeWindow = undefined;
  const controller = window.happyDOM;

  if (typeof controller?.close === "function") {
    await controller.close();
  } else {
    controller?.abort?.();
  }
}
