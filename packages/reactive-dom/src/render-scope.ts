import { normalizeRenderValue } from "./normalize.js";
import { createScope, disposeScope, withScope } from "./scope.js";
import type { Dispose, RenderValue } from "./types.js";

export interface ScopedRenderNodes {
  nodes: Node[];
  dispose: Dispose;
}

export function createScopedRenderNodes(render: () => RenderValue): ScopedRenderNodes {
  const scope = createScope();

  try {
    return {
      nodes: withScope(scope, () => normalizeRenderValue(render())),
      dispose: () => disposeScope(scope),
    };
  } catch (error) {
    disposeScope(scope);
    throw error;
  }
}
