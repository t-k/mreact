import { effect, untrack } from "@reckona/mreact-reactive-core";
import { registerDispose } from "./scope.js";
import type { Dispose } from "./types.js";

export interface BindTextBatchOptions {
  preserveInitial?: boolean;
}

function writeTextBatch(nodes: readonly Text[], text: string): void {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index] as Text;
    node.data = text;
  }
}

export function bindText(node: Text, value: () => unknown): Dispose {
  const reactiveText = node as Text & { __mreactReactiveText?: true };

  reactiveText.__mreactReactiveText = true;
  const dispose = effect(() => {
    node.data = String(value() ?? "");
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
    const text = String(value() ?? "");

    if (!shouldWrite) {
      shouldWrite = true;
      return;
    }

    untrack(() => writeTextBatch(nodes, text));
  });

  return registerDispose(dispose);
}
