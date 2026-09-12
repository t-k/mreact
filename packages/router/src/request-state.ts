import {
  installRequestStateStorage,
  runWithRequestState,
  type RequestStateStorage,
} from "@reckona/mreact-reactive-core";
import { getRequestStateStorage } from "@reckona/mreact-reactive-core/internal";

// Workers exposes async_hooks through process with nodejs_compat, but does not
// necessarily expose a global AsyncLocalStorage constructor. No static Node
// import: Workers without Node compatibility must still load ordinary routes.
const NativeStorage = (
  globalThis as {
    process?: {
      getBuiltinModule?: (
        id: string,
      ) => { AsyncLocalStorage?: new () => RequestStateStorage } | undefined;
    };
  }
).process?.getBuiltinModule?.("node:async_hooks")?.AsyncLocalStorage;
if (getRequestStateStorage() === undefined && NativeStorage !== undefined) {
  installRequestStateStorage(new NativeStorage());
}

/** Keeps request state available during rendering and subsequent body reads. */
export async function runWithRequestStateResponse(
  render: () => Promise<Response>,
): Promise<Response> {
  const storage = getRequestStateStorage();
  if (storage !== undefined) {
    return runWithRequestState(async () => {
      const scope = storage.getStore()!;
      const response = await render();
      if (response.body === null) return response;
      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          return storage.run(scope, async () => {
            try {
              const next = await reader.read();
              if (next.done) {
                reader.releaseLock();
                controller.close();
              } else {
                controller.enqueue(next.value);
              }
            } catch (error) {
              reader.releaseLock();
              controller.error(error);
            }
          });
        },
        cancel(reason) {
          return storage.run(scope, async () => {
            try {
              await reader.cancel(reason);
            } finally {
              reader.releaseLock();
            }
          });
        },
      });
      return new Response(body, response);
    });
  }

  // The state accessor fails closed without async context. Leave unrelated
  // routes and open-ended streams usable rather than sharing a global scope.
  return render();
}
