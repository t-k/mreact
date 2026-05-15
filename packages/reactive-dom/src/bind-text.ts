import { effect } from "@reckona/mreact-reactive-core";
import { registerDispose } from "./scope.js";
import type { Dispose } from "./types.js";

export interface BindTextBatchOptions {
  preserveInitial?: boolean;
}

function writeTextBatch(nodes: readonly Text[], text: string): void {
  for (const node of nodes) {
    node.data = text;
  }
}

function normalizeText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return value == null ? "" : String(value);
}

export function bindText(node: Text, value: () => unknown): Dispose {
  const reactiveText = node as Text & { __mreactReactiveText?: true };

  reactiveText.__mreactReactiveText = true;
  const dispose = effect(() => {
    node.data = normalizeText(value());
  });

  return registerDispose(dispose);
}

export function bindTextBatch(
  nodes: readonly Text[],
  value: () => unknown,
  options?: BindTextBatchOptions,
): Dispose {
  for (let index = 0; index < nodes.length; index += 1) {
    const reactiveText = nodes[index] as Text & { __mreactReactiveText?: true };
    reactiveText.__mreactReactiveText = true;
  }

  let shouldWrite = options?.preserveInitial !== true;

  const dispose = effect(() => {
    const text = normalizeText(value());

    if (!shouldWrite) {
      shouldWrite = true;
      return;
    }

    writeTextBatch(nodes, text);
  });

  return registerDispose(dispose);
}
