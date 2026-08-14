type RefCleanup = () => void;

const callbackRefCleanups = new WeakMap<Function, WeakMap<object, RefCleanup>>();

export function attachRef(ref: unknown, node: unknown): void {
  if (typeof ref === "function") {
    if (isObjectNode(node) && callbackRefCleanups.get(ref)?.has(node) === true) {
      return;
    }

    const cleanup = ref(node);
    if (typeof cleanup === "function" && isObjectNode(node)) {
      const cleanups = callbackRefCleanups.get(ref) ?? new WeakMap<object, RefCleanup>();
      cleanups.set(node, cleanup);
      callbackRefCleanups.set(ref, cleanups);
    }
    return;
  }

  if (typeof ref === "object" && ref !== null && "current" in ref) {
    (ref as { current: unknown }).current = node;
  }
}

export function detachRef(ref: unknown, node: unknown): void {
  if (typeof ref === "function") {
    const cleanups = callbackRefCleanups.get(ref);
    const cleanup = isObjectNode(node) ? cleanups?.get(node) : undefined;
    if (cleanup !== undefined) {
      cleanups?.delete(node as object);
      cleanup();
      return;
    }

    ref(null);
    return;
  }

  if (typeof ref === "object" && ref !== null && "current" in ref) {
    (ref as { current: unknown }).current = null;
  }
}

function isObjectNode(node: unknown): node is object {
  return (typeof node === "object" && node !== null) || typeof node === "function";
}
