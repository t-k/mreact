// React baseline. react / react-dom are marked external and provided via importmap (esm.sh).
import { createElement, memo, useReducer } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createHarness, type Adapter } from "./bench-core";

const adapter: Adapter = {
  name: "react",
  createElement: createElement as unknown as Adapter["createElement"],
  createRoot: createRoot as unknown as Adapter["createRoot"],
  memo: memo as unknown as Adapter["memo"],
  useReducer: useReducer as unknown as Adapter["useReducer"],
  flushSync: flushSync as unknown as Adapter["flushSync"],
};

const container = document.getElementById("tbody")!;
const harness = createHarness(adapter, container);
(globalThis as any).__bench = (warmup?: number, runs?: number) => harness.runAll(warmup, runs);
(globalThis as any).__runOp = (name: string, count: number) => harness.runOp(name, count);
(globalThis as any).__benchName = adapter.name;
