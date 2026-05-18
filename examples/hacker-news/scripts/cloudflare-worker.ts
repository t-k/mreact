// Cloudflare Workers entrypoint smoke target for the Hacker News example.
//
// The current Cloudflare adapter needs explicit route modules for dynamic
// pages. The Hacker News app exercises the built Node/dev renderer for those
// routes, while this Worker keeps the static asset binding and server-route
// shape importable until a generated Workers route-module registry exists.
import {
  createCloudflareBuiltRequestHandler,
  createCloudflareStaticAssetLoader,
} from "@reckona/mreact-router/adapters/cloudflare";
import clientManifest from "../.mreact/client/manifest.json" with { type: "json" };
import serverManifest from "../.mreact/server/manifest.json" with { type: "json" };

interface Env {
  ASSETS: {
    fetch(request: Request): Response | Promise<Response>;
  };
}

const handler = createCloudflareBuiltRequestHandler<Env>({
  assets: createCloudflareStaticAssetLoader({
    binding: (env) => env.ASSETS,
    clientManifest,
  }),
  clientManifest,
  renderRoute() {
    return new Response("Cloudflare dynamic route modules are not bundled for this example yet.", {
      headers: { "content-type": "text/plain; charset=utf-8" },
      status: 501,
    });
  },
  serverManifest,
});

export default {
  fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Promise.resolve(Response.json({ app: "mreact-hacker-news", ok: true }));
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const publicAssetResponse = servePublicAsset(request, env);

      if (publicAssetResponse !== undefined) {
        return publicAssetResponse;
      }
    }

    return handler.fetch(request, env, context);
  },
};

function servePublicAsset(request: Request, env: Env): Promise<Response> | undefined {
  const url = new URL(request.url);

  if (url.pathname !== "/styles.css") {
    return undefined;
  }

  url.pathname = "/public/styles.css";
  url.search = "";

  return Promise.resolve(env.ASSETS.fetch(new Request(url, request)));
}
