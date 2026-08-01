import { withCleanupScope } from "@reckona/mreact-reactive-core/internal";
import { normalizeRenderValue } from "./normalize.js";
import {
  createScope,
  disposeScope,
  hasScopeDisposers,
  registerCleanupDispose,
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
    const nodes = withScope(scope, () =>
      withCleanupScope(registerCleanupDispose, () => normalizeRenderValue(render())),
    );

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
    const node = withScope(scope, () => withCleanupScope(registerCleanupDispose, render));

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
    const node = withScope(scope, () => withCleanupScope(registerCleanupDispose, render));
    const result: { node: TNode; scope?: DomScope | undefined } = { node };

    if (hasScopeDisposers(scope)) {
      result.scope = scope;
    }

    return result;
  } catch (error) {
    disposeScope(scope);
    throw error;
  }
}
