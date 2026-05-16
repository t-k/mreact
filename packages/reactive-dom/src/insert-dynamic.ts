import { effect } from "@reckona/mreact-reactive-core";
import { normalizeRenderValue } from "./normalize.js";
import { registerDispose } from "./scope.js";
import type { Dispose, RenderValue } from "./types.js";

export function insertDynamic(
  parent: ParentNode,
  marker: ChildNode,
  value: () => RenderValue,
): Dispose {
  let current: Node[] = [];

  const clear = () => {
    for (const node of current) {
      node.parentNode?.removeChild(node);
    }

    current = [];
  };

  const dispose = effect(() => {
    const next = normalizeRenderValue(value());

    if (isSameNodeList(current, next)) {
      return;
    }

    clear();
    current = next;

    if (marker.parentNode !== parent) {
      current = [];
      return;
    }

    for (const node of current) {
      parent.insertBefore(node, marker);
    }
  });

  return registerDispose(() => {
    dispose();
    clear();
  });
}

function isSameNodeList(left: readonly Node[], right: readonly Node[]): boolean {
  return (
    left.length === right.length &&
    left.every((node, index) => node === right[index])
  );
}
