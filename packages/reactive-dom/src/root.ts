import { normalizeRenderValue } from "./normalize.js";
import { createScope, disposeScope, withScope } from "./scope.js";
import type { Dispose, RenderValue } from "./types.js";

/** Mounts a reactive render function into a DOM container. */
export function createRoot(
  container: ParentNode,
  render: () => RenderValue,
): Dispose {
  const scope = createScope();
  let nodes: Node[];

  try {
    nodes = withScope(scope, () => normalizeRenderValue(render()));
  } catch (error) {
    disposeScope(scope);
    throw error;
  }

  container.replaceChildren(...nodes);

  return () => {
    disposeScope(scope);
    container.replaceChildren();
  };
}
