import { describe, expect, test } from "vitest";
import { createCloudflareBuiltRequestHandler } from "../src/adapters/cloudflare.js";
import { compileRouteMatcherArtifact, createRouteMatcher, type AppRoute } from "../src/routes.js";
import {
  createLeadingStaticRouteLookup,
  partitionStaticRoutes,
} from "../src/static-route-lookup.js";

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

describe("createLeadingStaticRouteLookup", () => {
  test("narrows large dynamic route sets while preserving generic route order", () => {
    const genericFirst: RouteEntry = {
      name: "generic-first",
      segments: [{ kind: "dynamic", name: "section" }],
    };
    const genericLast: RouteEntry = {
      name: "generic-last",
      segments: [{ kind: "catch-all", name: "rest" }],
    };
    const specific = Array.from(
      { length: 70 },
      (_, index): RouteEntry => ({
        name: `item-${index}`,
        segments: [
          { kind: "static", value: "api" },
          { kind: "static", value: `item-${index}` },
          { kind: "dynamic", name: "id" },
        ],
      }),
    );
    const entries = [genericFirst, ...specific, genericLast];
    const lookup = createLeadingStaticRouteLookup(entries, (entry) => entry.segments);

    expect(lookup.candidates("/api/item-69/value")).toEqual([
      genericFirst,
      specific[69],
      genericLast,
    ]);
    expect(lookup.candidates("/api/absent/value")).toEqual([genericFirst, genericLast]);
    expect(lookup.candidates("/api/item-69%2Fvalue/value")).toEqual([genericFirst, genericLast]);
    expect(lookup.candidates("/api/item-69")).toEqual([genericFirst, specific[69], genericLast]);

    const genericBeforeSpecific = createLeadingStaticRouteLookup(
      [genericFirst, genericLast, ...specific],
      (entry) => entry.segments,
    );
    expect(genericBeforeSpecific.candidates("/api/item-69/value")).toEqual([
      genericFirst,
      genericLast,
      specific[69],
    ]);
  });

  test("keeps small and generic-heavy route sets on the existing candidate list", () => {
    const specific: RouteEntry = {
      name: "specific",
      segments: [
        { kind: "static", value: "api" },
        { kind: "static", value: "item" },
        { kind: "dynamic", name: "id" },
      ],
    };
    const small = [specific];
    expect(
      createLeadingStaticRouteLookup(small, (entry) => entry.segments).candidates("/api/item/1"),
    ).toBe(small);

    const generic = Array.from(
      { length: 33 },
      (_, index): RouteEntry => ({
        name: `generic-${index}`,
        segments: [{ kind: "dynamic", name: `value${index}` }],
      }),
    );
    const all = [
      ...generic,
      ...Array.from(
        { length: 70 },
        (_, index): RouteEntry => ({
          ...specific,
          name: `item-${index}`,
          segments: [
            specific.segments[0]!,
            { kind: "static", value: `item-${index}` },
            specific.segments[2]!,
          ],
        }),
      ),
    ];
    expect(
      createLeadingStaticRouteLookup(all, (entry) => entry.segments).candidates("/api/item-69/1"),
    ).toBe(all);
  });

  test("only builds an index at 64 routes with at least two prefixes", () => {
    const entries = Array.from(
      { length: 64 },
      (_, index): RouteEntry => ({
        name: `route-${index}`,
        segments: [
          { kind: "static", value: "api" },
          { kind: "static", value: index < 32 ? "first" : "second" },
          { kind: "dynamic", name: `id${index}` },
        ],
      }),
    );
    const onePrefix = entries.map((entry) => ({
      ...entry,
      segments: [
        entry.segments[0]!,
        { kind: "static" as const, value: "first" },
        entry.segments[2]!,
      ],
    }));

    expect(
      createLeadingStaticRouteLookup(entries.slice(0, 63), (entry) => entry.segments).candidates(
        "/api/first/x",
      ),
    ).toHaveLength(63);
    expect(
      createLeadingStaticRouteLookup(entries, (entry) => entry.segments).candidates("/api/first/x"),
    ).toHaveLength(32);
    expect(
      createLeadingStaticRouteLookup(onePrefix, (entry) => entry.segments).candidates(
        "/api/first/x",
      ),
    ).toBe(onePrefix);
  });

  test("keeps malformed and dynamic leading segments in candidate lists", () => {
    const generic: RouteEntry[] = [
      { name: "empty", segments: [] },
      { name: "one-static-segment", segments: [{ kind: "static", value: "api" }] },
      {
        name: "missing-first-value",
        segments: [{ kind: "static" }, { kind: "static", value: "item" }] as RouteEntry["segments"],
      },
      {
        name: "dynamic-first",
        segments: [
          { kind: "dynamic", name: "section" },
          { kind: "static", value: "item" },
        ],
      },
      {
        name: "missing-second-value",
        segments: [{ kind: "static", value: "api" }, { kind: "static" }] as RouteEntry["segments"],
      },
      {
        name: "dynamic-second",
        segments: [
          { kind: "static", value: "api" },
          { kind: "dynamic", name: "item" },
        ],
      },
    ];
    const specifics = Array.from(
      { length: 70 },
      (_, index): RouteEntry => ({
        name: `specific-${index}`,
        segments: [
          { kind: "static", value: "api" },
          { kind: "static", value: `item-${index}` },
          { kind: "dynamic", name: "id" },
        ],
      }),
    );
    const lookup = createLeadingStaticRouteLookup(
      [...generic, ...specifics],
      (entry) => entry.segments,
    );

    expect(lookup.candidates("/api/item-69/x")).toEqual([...generic, specifics[69]]);
    expect(lookup.candidates("/api/absent/x")).toEqual(generic);
  });

  test("caps duplicated generic candidates and keeps the exact boundary indexed", () => {
    const generic = Array.from(
      { length: 32 },
      (_, index): RouteEntry => ({
        name: `generic-${index}`,
        segments: [{ kind: "dynamic", name: `id${index}` }],
      }),
    );
    const specifics = Array.from(
      { length: 3126 },
      (_, index): RouteEntry => ({
        name: `specific-${index}`,
        segments: [
          { kind: "static", value: "api" },
          { kind: "static", value: `item-${index}` },
          { kind: "dynamic", name: "id" },
        ],
      }),
    );
    const withinBudget = [...generic, ...specifics.slice(0, 3125)];
    const overBudget = [...generic, ...specifics];

    expect(
      createLeadingStaticRouteLookup(withinBudget, (entry) => entry.segments).candidates(
        "/api/item-3124/x",
      ),
    ).toHaveLength(33);
    expect(
      createLeadingStaticRouteLookup(overBudget, (entry) => entry.segments).candidates(
        "/api/item-3125/x",
      ),
    ).toBe(overBudget);
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

  test("large dynamic route sets match the same path and params in built and Cloudflare handlers", async () => {
    const many: AppRoute[] = Array.from({ length: 70 }, (_, index) => {
      const item = `item-${String(index).padStart(5, "0")}`;
      return {
        kind: "server",
        path: `/api/${item}/:id`,
        file: `api/${item}/$id/route.ts`,
        segments: [
          { kind: "static", value: "api" },
          { kind: "static", value: item },
          { kind: "dynamic", name: "id" },
        ],
      };
    });
    const catchAll: AppRoute = {
      kind: "server",
      path: "/api/:...rest",
      file: "api/$...rest/route.ts",
      segments: [
        { kind: "static", value: "api" },
        { kind: "catch-all", name: "rest" },
      ],
    };
    const all = [catchAll, ...many];
    const matcher = createRouteMatcher(all, compileRouteMatcherArtifact(all));
    const sourceMatcher = createRouteMatcher(all);
    const handler = createCloudflareBuiltRequestHandler({
      clientManifest: { routes: [] },
      serverManifest: { files: {}, routes: all, version: 1 },
      renderRoute: (_request, context) =>
        Response.json({ path: context.route.path, params: context.params }),
    });
    const context = { passThroughOnException() {}, waitUntil() {} };
    const cases = [
      { path: "/api/item-00069/caf%C3%A9", route: "/api/item-00069/:id", params: { id: "café" } },
      { path: "/api/absent/value", route: "/api/:...rest", params: { rest: ["absent", "value"] } },
      { path: "/api/item-00069/%ZZ", route: undefined, params: undefined },
    ];
    for (const item of cases) {
      expect(matcher.match(item.path)?.route.path).toBe(item.route);
      expect(matcher.match(item.path)?.params).toEqual(item.params);
      expect(sourceMatcher.match(item.path)?.route.path).toBe(item.route);
      expect(sourceMatcher.match(item.path)?.params).toEqual(item.params);
      const response = await handler.fetch(
        new Request(`https://example.test${item.path}`),
        {},
        context,
      );
      expect(response.status).toBe(item.route === undefined ? 404 : 200);
      if (item.route !== undefined) {
        expect(await response.json()).toEqual({ path: item.route, params: item.params });
      }
    }
  });
});
