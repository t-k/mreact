import { describe, expect, test } from "vitest";
import { loadRouteDataFromModule } from "../src/route-loader-runtime.js";

describe("route loader runtime", () => {
  test("does not load a module when the route has no loader export", async () => {
    let loadCount = 0;

    const data = await loadRouteDataFromModule({
      context: {
        params: {},
        queryClient: {} as never,
        request: new Request("http://local.test/"),
      },
      hasLoader: false,
      async loadModule() {
        loadCount += 1;
        return {};
      },
    });

    expect(data).toBeUndefined();
    expect(loadCount).toBe(0);
  });

  test("returns Response objects thrown by loaders as route data control responses", async () => {
    const controlResponse = new Response(null, {
      headers: { location: "/login" },
      status: 303,
    });

    const data = await loadRouteDataFromModule({
      context: {
        params: {},
        queryClient: {} as never,
        request: new Request("http://local.test/"),
      },
      hasLoader: true,
      async loadModule() {
        return {
          loader() {
            throw controlResponse;
          },
        };
      },
    });

    expect(data).toBe(controlResponse);
  });
});
