import { normalizeRenderValue } from "./normalize.js";
import { createScope, disposeScope, hasScopeDisposers, withScope } from "./scope.js";
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
