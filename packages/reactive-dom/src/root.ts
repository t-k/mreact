import { normalizeRenderValue } from "./normalize.js";
import { withCleanupScope } from "@reckona/mreact-reactive-core/internal";
import { createScope, disposeScope, registerCleanupDispose, withScope } from "./scope.js";
import type { Dispose, RenderValue } from "./types.js";

/** Mounts a reactive render function into a DOM container. */
export function createRoot(
  container: ParentNode,
  render: () => RenderValue,
): Dispose {
  const scope = createScope();
  let nodes: Node[];

  try {
    nodes = withScope(scope, () =>
      withCleanupScope(registerCleanupDispose, () => normalizeRenderValue(render())),
    );
  } catch (error) {
    disposeScope(scope);
    throw error;
  }

  container.replaceChildren(...nodes);

  return () => {
    let firstError: unknown;

    try {
      disposeScope(scope);
    } catch (error) {
      firstError = error;
    }

    try {
      container.replaceChildren();
    } catch (error) {
      firstError ??= error;
    }

    if (firstError !== undefined) {
      throw firstError;
    }
  };
}
