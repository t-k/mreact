import { registerDispose } from "./scope.js";
import type { Dispose } from "./types.js";

export interface PropBinding {
  dispose: Dispose;
  retarget: (element: Element) => void;
}

type PropElement = Element & {
  __mreactHasReactiveProps?: true;
  __mreactPropBindings?: PropBinding[];
};

let propBindingMetadataDepth = 0;

export function withPropBindingMetadata<T>(fn: () => T): T {
  propBindingMetadataDepth += 1;

  try {
    return fn();
  } finally {
    propBindingMetadataDepth -= 1;
  }
}

export function hasActivePropBindingMetadata(): boolean {
  return propBindingMetadataDepth > 0;
}

export function registerReactivePropBinding(element: Element, binding: PropBinding): Dispose {
  if (propBindingMetadataDepth === 0) {
    return registerDispose(binding.dispose);
  }

  const propElement = element as PropElement;

  propElement.__mreactHasReactiveProps = true;
  const bindings = propElement.__mreactPropBindings;

  if (bindings === undefined) {
    propElement.__mreactPropBindings = [binding];
  } else {
    bindings.push(binding);
  }

  return registerDispose(() => {
    binding.dispose();
    const bindings = propElement.__mreactPropBindings;
    const index = bindings?.indexOf(binding) ?? -1;

    if (index !== -1) {
      bindings?.splice(index, 1);
    }

    if (bindings?.length === 0) {
      delete propElement.__mreactHasReactiveProps;
    }
  });
}
