import { normalizeRenderValue } from "./normalize.js";
import {
  createScope,
  disposeScope,
  hasScopeDisposers,
  withScope,
  type DomScope,
} from "./scope.js";
import type { Dispose, RenderValue } from "./types.js";

export interface ScopedRenderNodes {
  nodes: Node[];
  dispose: Dispose;
}

const noopDispose: Dispose = () => {};

export function createScopedRenderNodes(render: () => RenderValue): ScopedRenderNodes {
  const scope = createScope();

  try {
    const nodes = withScope(scope, () => normalizeRenderValue(render()));

    return {
      nodes,
      dispose: hasScopeDisposers(scope) ? () => disposeScope(scope) : noopDispose,
    };
  } catch (error) {
    disposeScope(scope);
    throw error;
  }
}

export function createScopedRenderNode<TNode extends ChildNode>(
  render: () => TNode,
): { dispose: Dispose; node: TNode } {
  const scope = createScope();

  try {
    const node = withScope(scope, render);

    return {
      dispose: hasScopeDisposers(scope) ? () => disposeScope(scope) : noopDispose,
      node,
    };
  } catch (error) {
    disposeScope(scope);
    throw error;
  }
}

export function createScopedRenderNodeScope<TNode extends ChildNode>(
  render: () => TNode,
): { node: TNode; scope?: DomScope | undefined } {
  const scope = createScope();

  try {
    const node = withScope(scope, render);

    return {
      node,
      ...(hasScopeDisposers(scope) ? { scope } : {}),
    };
  } catch (error) {
    disposeScope(scope);
    throw error;
  }
}
