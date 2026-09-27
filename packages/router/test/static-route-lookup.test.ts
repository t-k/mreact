import { describe, expect, test } from "vitest";
import { createCloudflareBuiltRequestHandler } from "../src/adapters/cloudflare.js";
import { compileRouteMatcherArtifact, createRouteMatcher, type AppRoute } from "../src/routes.js";
import { partitionStaticRoutes } from "../src/static-route-lookup.js";

interface RouteEntry {
  name: string;
  segments: readonly (
    | { kind: "static"; value: string }
    | { kind: "dynamic"; name: string }
    | { kind: "catch-all"; name: string }
  )[];
}

describe("partitionStaticRoutes", () => {
  test("indexes static paths and preserves the first matching route", () => {
    const root: RouteEntry = { name: "root", segments: [] };
    const first: RouteEntry = {
      name: "first",
      segments: [
        { kind: "static", value: "api" },
        { kind: "static", value: "item" },
      ],
    };
    const duplicate: RouteEntry = { name: "duplicate", segments: first.segments };
    const dynamic: RouteEntry = {
      name: "dynamic",
      segments: [
        { kind: "static", value: "api" },
        { kind: "dynamic", name: "id" },
      ],
    };
    const catchAll: RouteEntry = {
      name: "catch-all",
      segments: [
        { kind: "static", value: "api" },
        { kind: "catch-all", name: "rest" },
      ],
    };

    const partition = partitionStaticRoutes(
      [root, first, duplicate, dynamic, catchAll],
      (entry) => entry.segments,
    );

    expect(partition.exact.get("/")).toBe(root);
    expect(partition.exact.get("/api/item")).toBe(first);
    expect(partition.exact.size).toBe(2);
    expect(partition.other).toEqual([dynamic, catchAll]);
  });

  test("keeps encoded static segment values as exact path keys", () => {
    const route: RouteEntry = {
      name: "encoded",
      segments: [{ kind: "static", value: "caf%C3%A9" }],
    };

    const partition = partitionStaticRoutes([route], (entry) => entry.segments);

    expect(partition.exact.get("/caf%C3%A9")).toBe(route);
    expect(partition.exact.get("/café")).toBeUndefined();
  });

  test("does not index malformed static segments without a value", () => {
    const malformed = { segments: [{ kind: "static" }] };
    const partition = partitionStaticRoutes([malformed], (entry) => entry.segments);

    expect(partition.exact.size).toBe(0);
    expect(partition.other).toEqual([malformed]);
  });
});

describe("indexed route matching", () => {
  const routes: AppRoute[] = [
    {
      kind: "server",
      path: "/api/fixed",
      file: "api/fixed/route.ts",
      segments: [
        { kind: "static", value: "api" },
        { kind: "static", value: "fixed" },
      ],
    },
    {
      kind: "server",
      path: "/api/:id",
      file: "api/$id/route.ts",
      segments: [
        { kind: "static", value: "api" },
        { kind: "dynamic", name: "id" },
      ],
    },
  ];

  test("compiled matcher does not rescan static segments after initialization", () => {
    const artifact = compileRouteMatcherArtifact(routes);
    const matcher = createRouteMatcher(routes, artifact);
    const staticEntry = artifact.routes.find((entry) =>
      entry.segments.every((part) => part.kind === "static"),
    );
    if (staticEntry === undefined) throw new Error("Missing static entry");
    Object.defineProperty(staticEntry, "segments", {
      get() {
        throw new Error("Static segments were rescanned");
      },
    });

    expect(matcher.match("/api/fixed")?.route.path).toBe("/api/fixed");
    expect(matcher.match("/api/other")?.route.path).toBe("/api/:id");
  });

  test("compiled matcher keeps static precedence and returns fresh params", () => {
    const artifact = compileRouteMatcherArtifact(routes);
    const matcher = createRouteMatcher(routes, artifact);

    const first = matcher.match("/api/fixed");
    if (first === undefined) throw new Error("Missing exact route");
    first.params.untrusted = "value";

    expect(matcher.match("/api/fixed/")).toEqual({ route: routes[0], params: {} });
    expect(matcher.match("/api/other")?.params).toEqual({ id: "other" });
    expect(matcher.match("/api/%ZZ")).toBeUndefined();
  });

  test("compiled matcher skips an invalid exact entry and finds the later valid entry", () => {
    const artifact = compileRouteMatcherArtifact(routes);
    const exact = artifact.routes.find((entry) =>
      entry.segments.every((part) => part.kind === "static"),
    );
    if (exact === undefined) throw new Error("Missing static entry");
    const corruptArtifact = {
      ...artifact,
      routes: [{ ...exact, routeIndex: routes.length + 1 }, ...artifact.routes],
    };

    expect(createRouteMatcher(routes, corruptArtifact).match("/api/fixed")?.route.path).toBe(
      "/api/fixed",
    );
  });

  test("Cloudflare matcher does not rescan static segments after initialization", async () => {
    const manifestRoutes = routes.map((route) => ({
      ...route,
      segments: route.segments.map((segment) => ({ ...segment })),
    }));
    const handler = createCloudflareBuiltRequestHandler({
      clientManifest: { routes: [] },
      serverManifest: { files: {}, routes: manifestRoutes, version: 1 },
      renderRoute: (_request, context) => new Response(context.route.path),
    });
    Object.defineProperty(manifestRoutes[0], "segments", {
      get() {
        throw new Error("Static segments were rescanned");
      },
    });
    const context = { passThroughOnException() {}, waitUntil() {} };

    expect(
      await (
        await handler.fetch(new Request("https://example.test/api/fixed"), {}, context)
      ).text(),
    ).toBe("/api/fixed");
    expect(
      await (
        await handler.fetch(new Request("https://example.test/api/other"), {}, context)
      ).text(),
    ).toBe("/api/:id");
  });

  test("Cloudflare index preserves manifest order and new handlers see manifest changes", async () => {
    const manifestRoutes = [routes[1]!, routes[0]!].map((route) => ({
      ...route,
      segments: route.segments.map((segment) => ({ ...segment })),
    }));
    const serverManifest = { files: {}, routes: manifestRoutes, version: 1 as const };
    const options = {
      clientManifest: { routes: [] },
      serverManifest,
      renderRoute: (_request: Request, context: { route: AppRoute }) =>
        new Response(context.route.path),
    };
    const original = createCloudflareBuiltRequestHandler(options);

    expect(manifestRoutes.map((route) => route.path)).toEqual(["/api/:id", "/api/fixed"]);
    manifestRoutes[1] = {
      ...routes[0]!,
      path: "/api/new",
      segments: [
        { kind: "static", value: "api" },
        { kind: "static", value: "new" },
      ],
    };
    const updated = createCloudflareBuiltRequestHandler(options);
    const context = { passThroughOnException() {}, waitUntil() {} };

    expect(
      await (
        await original.fetch(new Request("https://example.test/api/fixed"), {}, context)
      ).text(),
    ).toBe("/api/fixed");
    expect(
      await (await updated.fetch(new Request("https://example.test/api/new"), {}, context)).text(),
    ).toBe("/api/new");
  });

  test("Cloudflare dynamic route does not match an empty root segment", async () => {
    const dynamic: AppRoute = {
      kind: "server",
      path: "/:id",
      file: "$id/route.ts",
      segments: [{ kind: "dynamic", name: "id" }],
    };
    const handler = createCloudflareBuiltRequestHandler({
      clientManifest: { routes: [] },
      serverManifest: { files: {}, routes: [dynamic], version: 1 },
      renderRoute: () => new Response("incorrect route"),
    });
    const context = { passThroughOnException() {}, waitUntil() {} };

    expect((await handler.fetch(new Request("https://example.test/"), {}, context)).status).toBe(
      404,
    );
  });

  test("Cloudflare fallback keeps specificity order for dynamic routes", async () => {
    const catchAll: AppRoute = {
      kind: "server",
      path: "/:...rest",
      file: "$...rest/route.ts",
      segments: [{ kind: "catch-all", name: "rest" }],
    };
    const dynamic: AppRoute = {
      kind: "server",
      path: "/api/:id",
      file: "api/$id/route.ts",
      segments: [
        { kind: "static", value: "api" },
        { kind: "dynamic", name: "id" },
      ],
    };
    const handler = createCloudflareBuiltRequestHandler({
      clientManifest: { routes: [] },
      serverManifest: { files: {}, routes: [catchAll, dynamic], version: 1 },
      renderRoute: (_request, context) => new Response(context.route.path),
    });
    const context = { passThroughOnException() {}, waitUntil() {} };

    expect(
      await (await handler.fetch(new Request("https://example.test/api/item"), {}, context)).text(),
    ).toBe("/api/:id");
  });
});
