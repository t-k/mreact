// Cloudflare Workers entrypoint shape for a built mreact app.
//
// Build the app first, then bundle this file with Wrangler or your
// Workers bundler. The `ASSETS` binding should point at the generated
// `.mreact/client` directory. Dynamic rendering is intentionally injected:
// replace `render` with your compiled edge render integration when your app
// has non-prerendered routes.
import {
  type CloudflareBuiltRouteRenderContext,
  collectCloudflareRouteModules,
  createCloudflareBuiltRequestHandler,
  createCloudflarePrerenderStore,
  createCloudflareRouteModuleRenderer,
  createCloudflareStaticAssetLoader,
} from "@reckona/mreact-router/adapters/cloudflare";
import clientManifest from "../.mreact/client/manifest.json" with { type: "json" };
import serverManifest from "../.mreact/server/manifest.json" with { type: "json" };

interface Env {
  ASSETS: {
    fetch(request: Request): Response | Promise<Response>;
  };
}

const routeModules = collectCloudflareRouteModules(
  import.meta.glob("./cloudflare-routes/**/*.{js,mjs,ts,tsx}"),
  { manifest: serverManifest },
);
const renderRouteModule = createCloudflareRouteModuleRenderer<Env>({
  modules: routeModules,
});

const handler = createCloudflareBuiltRequestHandler<Env>({
  assets: createCloudflareStaticAssetLoader({
    binding: (env) => env.ASSETS,
    clientManifest,
  }),
  clientManifest,
  renderRoute(request, context) {
    const cache = (globalThis as typeof globalThis & { caches?: { default: Cache } }).caches
      ?.default;

    return renderCloudflareAppRequest(request, context, {
      prerenderStore: cache === undefined ? undefined : createCloudflarePrerenderStore({ cache }),
    });
  },
  serverManifest,
});

export default {
  fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    return handler.fetch(request, env, context);
  },
};

async function renderCloudflareAppRequest(
  request: Request,
  context: CloudflareBuiltRouteRenderContext<Env>,
  options: {
    prerenderStore?: ReturnType<typeof createCloudflarePrerenderStore> | undefined;
  },
): Promise<Response> {
  void options.prerenderStore;
  const response = await renderRouteModule(request, context);

  return response;
}
