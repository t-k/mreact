// Cloudflare Workers entrypoint shape for a built mreact app.
//
// Build the app first, then bundle this file with Wrangler or your
// Workers bundler. The `ASSETS` binding should point at the generated
// `.mreact/client` directory. Dynamic rendering is intentionally injected:
// replace `render` with your compiled edge render integration when your app
// has non-prerendered routes.
import {
  createCloudflareBuiltRequestHandler,
  createCloudflarePrerenderStore,
  createCloudflareStaticAssetLoader,
} from "@modular-react/router/adapters/cloudflare";
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
  renderRoute(request, { params, route }) {
    const cache = (globalThis as typeof globalThis & { caches?: { default: Cache } }).caches
      ?.default;

    return renderCloudflareAppRequest({
      params,
      prerenderStore: cache === undefined ? undefined : createCloudflarePrerenderStore({ cache }),
      request,
      routePath: route.path,
    });
  },
  serverManifest,
});

export default {
  fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    return handler.fetch(request, env, context);
  },
};

async function renderCloudflareAppRequest(options: {
  params: Record<string, string>;
  prerenderStore?: ReturnType<typeof createCloudflarePrerenderStore> | undefined;
  request: Request;
  routePath: string;
}): Promise<Response> {
  void options.prerenderStore;
  void options.params;
  const pathname = new URL(options.request.url).pathname;

  return new Response(
    `No Cloudflare edge render was configured for ${options.routePath} (${pathname}).`,
    {
      headers: { "content-type": "text/plain; charset=utf-8" },
      status: 404,
    },
  );
}
