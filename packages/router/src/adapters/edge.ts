export type EdgeRequestHandler = (request: Request) => Response | Promise<Response>;

export interface EdgeRequestHandlerOptions {
  onError?: ((error: unknown, request: Request) => Response | Promise<Response>) | undefined;
  render: EdgeRequestHandler;
}

export function createEdgeRequestHandler(options: EdgeRequestHandlerOptions): EdgeRequestHandler {
  return async (request) => {
    emitRouterDevtoolsEvent({
      method: request.method,
      type: "router:request:start",
      url: request.url,
    });

    try {
      const response = await options.render(request);
      emitRouterDevtoolsEvent({
        method: request.method,
        status: response.status,
        type: "router:request:end",
        url: request.url,
      });

      return response;
    } catch (error) {
      emitRouterDevtoolsEvent({
        method: request.method,
        type: "router:request:error",
        url: request.url,
      });

      return options.onError === undefined
        ? new Response("Internal Server Error", {
            headers: { "content-type": "text/plain; charset=utf-8" },
            status: 500,
          })
        : await options.onError(error, request);
    }
  };
}

function emitRouterDevtoolsEvent(event: Record<string, unknown>): void {
  const devtools = (
    globalThis as typeof globalThis & {
      __mreactDevtools?: { emit?: (event: Record<string, unknown>) => void };
    }
  ).__mreactDevtools;

  devtools?.emit?.({
    package: "@reckona/mreact-router",
    timestamp: Date.now(),
    ...event,
  });
}
