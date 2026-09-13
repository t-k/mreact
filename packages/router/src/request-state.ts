import {
  installRequestStateStorage,
  type RequestStateStorage,
} from "@reckona/mreact-reactive-core";
import {
  disposeRequestStateScope,
  getRequestStateStorage,
} from "@reckona/mreact-reactive-core/internal";

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
    return storage.run(new Map(), async () => {
      const scope = storage.getStore()!;
      try {
        const response = await render();
        if (response.body === null) {
          disposeRequestStateScope(scope);
          return response;
        }
        const reader = response.body.getReader();
        let cancelling = false;
        const finish = (suppressErrors = false): void => {
          reader.releaseLock();
          disposeRequestStateScope(scope, suppressErrors);
        };
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            return storage.run(scope, async () => {
              try {
                const next = await reader.read();
                // Cancellation owns cleanup until the source's cancel hook settles.
                if (cancelling) return;
                if (next.done) {
                  finish();
                  controller.close();
                } else {
                  controller.enqueue(next.value);
                }
              } catch (error) {
                if (cancelling) return;
                finish(true);
                controller.error(error);
              }
            });
          },
          cancel(reason) {
            cancelling = true;
            return storage.run(scope, async () => {
              try {
                await reader.cancel(reason);
              } catch (error) {
                finish(true);
                throw error;
              }
              finish();
            });
          },
        });
        return new Response(body, response);
      } catch (error) {
        disposeRequestStateScope(scope, true);
        throw error;
      }
    });
  }

  // The state accessor fails closed without async context. Leave unrelated
  // routes and open-ended streams usable rather than sharing a global scope.
  return render();
}
