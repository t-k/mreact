import { createElement, createRoot, flushSync, memo, useReducer } from "@reckona/mreact-compat";
import { createReactiveDomBlock } from "@reckona/mreact-compat/jsx-runtime";
import { bindText } from "@reckona/mreact-reactive-dom";
import { effect } from "@reckona/mreact-reactive-core";
import { createHarness, type Adapter } from "./bench-core";

const adapter: Adapter = {
  name: "mreact-reactive",
  createElement: createElement as Adapter["createElement"],
  createRoot: createRoot as unknown as Adapter["createRoot"],
  memo: memo as Adapter["memo"],
  useReducer: useReducer as unknown as Adapter["useReducer"],
  flushSync: flushSync as Adapter["flushSync"],
  reactive: {
    createReactiveDomBlock: createReactiveDomBlock as Adapter["reactive"]["createReactiveDomBlock"],
    bindText: bindText as unknown as Adapter["reactive"]["bindText"],
    effect: effect as unknown as Adapter["reactive"]["effect"],
  },
};

const container = document.getElementById("tbody")!;
const harness = createHarness(adapter, container);
(globalThis as any).__bench = (warmup?: number, runs?: number) => harness.runAll(warmup, runs);
(globalThis as any).__runOp = (name: string, count: number) => harness.runOp(name, count);
(globalThis as any).__benchName = adapter.name;
