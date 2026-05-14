import { effect } from "@modular-react/reactive-core";
import { registerDispose } from "./scope.js";
import type { Dispose } from "./types.js";

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
): Dispose {
  const dispose = effect(() => {
    const text = String(value() ?? "");

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index] as Text;
      const reactiveText = node as Text & { __mreactReactiveText?: true };
      reactiveText.__mreactReactiveText = true;
      node.data = text;
    }
  });

  return registerDispose(dispose);
}
