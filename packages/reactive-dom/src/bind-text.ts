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
