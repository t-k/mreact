// Edge-runtime handler shape using
// @reckona/mreact-router/adapters/edge.
//
// The edge adapter is intentionally minimal: it accepts a
// `(Request) => Response` render function and wraps it with
// devtools-aware error handling. It does NOT import any
// `node:*` modules, so this file is safe to bundle for Cloudflare
// Workers / Vercel Edge / Deno Deploy / Bun.serve / etc.
//
// In a real deployment your bundler would tree-shake out everything
// you don't reference and ship the `handler` export. This file is
// purely an API-shape reference — running it locally needs a `render`
// implementation appropriate for the target environment.
import {
  createEdgeRequestHandler,
  type EdgeRequestHandler,
} from "@reckona/mreact-router/adapters/edge";

/**
 * Replace this with your runtime's render integration. Examples:
 *   - Cloudflare Workers: `(request) => renderEdgeRequest(request, manifestUrl)`
 *   - Vercel Edge: same shape, imported from your app's edge entry.
 *   - Static fallback: read the prerendered HTML from KV and respond.
 */
const render: EdgeRequestHandler = (request) => {
  const url = new URL(request.url);
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>mreact edge</title><h1>mreact edge</h1><p>${url.pathname}</p>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
};

export const handler = createEdgeRequestHandler({
  render,
  onError(error, request) {
    console.error("edge render failed", request.url, error);
    return new Response("Internal Server Error", {
      headers: { "content-type": "text/plain; charset=utf-8" },
      status: 500,
    });
  },
});

// Local smoke test: if you run this file directly, fire one fake
// Request through the handler so the shape is exercised end-to-end.
if (import.meta.url === `file://${process.argv[1]}`) {
  const probe = await handler(new Request("http://edge.local/about"));
  console.log(`status ${probe.status}, content-type ${probe.headers.get("content-type")}`);
  console.log((await probe.text()).slice(0, 120));
}
