import { access, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { buildApp } from "../src/build.js";
import {
  createAwsLambdaRequestHandler,
  createPreloadedAwsLambdaRequestHandler,
  createAwsLambdaStreamingRequestHandler,
  type AwsLambdaHttpEventV2,
} from "../src/adapters/aws-lambda.js";
import type { AppRouterLogEvent, AppRouterLogger } from "../src/logger.js";

const originalAwsLambda = (globalThis as { awslambda?: unknown }).awslambda;

afterEach(() => {
  (globalThis as { awslambda?: unknown }).awslambda = originalAwsLambda;
});

describe("mreact AWS Lambda adapter", () => {
  test("rejects malformed HTTP API v2 events before request routing", async () => {
    const { outDir } = await createBuiltApp("mreact-lambda-invalid-event-");
    const handler = createAwsLambdaRequestHandler({ outDir });

    await expect(
      handler({
        rawPath: "/",
        rawQueryString: "",
        requestContext: { http: { method: "GET" } },
        version: "1.0",
      } as never),
    ).resolves.toMatchObject({ body: "Bad Request", statusCode: 400 });
  });

  test("renders a built app from an API Gateway HTTP API v2 event", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-render-");
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>Hello Lambda</main>;
}`,
    );
    await buildApp({ appDir, outDir });
    const handler = createAwsLambdaRequestHandler({ outDir });

    const result = await handler({
      cookies: ["sid=1"],
      headers: {
        host: "lambda.test",
        "x-forwarded-proto": "https",
      },
      rawPath: "/",
      rawQueryString: "name=Ada",
      requestContext: {
        http: {
          method: "GET",
        },
      },
      version: "2.0",
    });

    expect(result.statusCode).toBe(200);
    expect(result.isBase64Encoded).toBe(false);
    expect(result.headers?.["content-type"]).toContain("text/html");
    expect(result.body).toContain("<main>Hello Lambda</main>");
  });

  test("propagates default security headers from built app responses", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-security-headers-");
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>Lambda security</main>;
}`,
    );
    await buildApp({ appDir, outDir });
    const handler = createAwsLambdaRequestHandler({ outDir });

    const result = await handler(lambdaEvent("/"));

    expect(result.statusCode).toBe(200);
    expect(result.headers?.["x-content-type-options"]).toBe("nosniff");
    expect(result.headers?.["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(result.headers?.["permissions-policy"]).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });

  test("does not trust forwarded host by default in production", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-forwarded-host-");
    await writeUrlEchoRoute(appDir);
    await buildApp({ appDir, outDir });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await withNodeEnv("production", async () => {
        const handler = createAwsLambdaRequestHandler({ outDir });
        const result = await handler({
          ...lambdaEvent("/"),
          headers: {
            host: "api.example",
            "x-forwarded-host": "evil.example",
            "x-forwarded-proto": "https",
          },
        });

        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body)).toEqual({ url: "https://lambda.local/" });
      });
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Host header trust is implicit"));
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("uses the host header when it is allow-listed and forwarded host is attacker-controlled", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-allowed-host-");
    await writeUrlEchoRoute(appDir);
    await buildApp({ appDir, outDir });
    const handler = createAwsLambdaRequestHandler({ allowedHosts: ["api.example"], outDir });

    const result = await handler({
      ...lambdaEvent("/"),
      headers: {
        host: "api.example",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
      },
    });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ url: "https://api.example/" });
  });

  test("does not trust forwarded proto unless explicitly enabled", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-forwarded-proto-");
    await writeUrlEchoRoute(appDir);
    await buildApp({ appDir, outDir });
    const handler = createAwsLambdaRequestHandler({ allowedHosts: ["api.example"], outDir });

    const result = await handler({
      ...lambdaEvent("/"),
      headers: {
        host: "api.example",
        "x-forwarded-proto": "https",
      },
      requestContext: {
        http: {
          method: "GET",
          protocol: "HTTP/1.1",
        },
      },
    });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ url: "http://api.example/" });
  });

  test("emits opt-in AWS Lambda phase timings", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-timings-");
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>Timed Lambda</main>;
}`,
    );
    await buildApp({ appDir, outDir });
    const events: AppRouterLogEvent[] = [];
    const logger: AppRouterLogger = {
      debug(event) {
        events.push(event);
      },
    };
    const handler = createAwsLambdaRequestHandler({ logger, outDir, timings: true });

    const result = await handler(lambdaEvent("/"));

    expect(result.statusCode).toBe(200);
    await eventually(() => {
      expect(events).toHaveLength(2);
    });
    const requestTiming = events.find((event) => event.type === "router:request:timing");
    expect(requestTiming).toMatchObject({
      method: "GET",
      path: "/",
      runtime: "aws-lambda",
      status: 200,
      type: "router:request:timing",
    });
    const timing = requestTiming;
    if (timing?.type !== "router:request:timing") {
      throw new Error("expected timing event");
    }
    expect(timing.durationMs).toBeGreaterThanOrEqual(0);
    expect(timing.phases.eventToRequestMs).toBeGreaterThanOrEqual(0);
    expect(timing.phases.runtimeDirMs).toBeGreaterThanOrEqual(0);
    expect(timing.phases.renderMs).toBeGreaterThanOrEqual(0);
    expect(timing.phases.responseSerializationMs).toBeGreaterThanOrEqual(0);
    const renderTiming = events.find((event) => event.type === "router:render:timing");
    expect(renderTiming).toMatchObject({
      method: "GET",
      path: "/",
      status: 200,
      type: "router:render:timing",
    });
  });

  test("forwards built loader timing splits for Lambda redirects", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-loader-timing-split-");
    await writeFile(
      join(appDir, "page.tsx"),
      `import { redirect } from "@reckona/mreact-router";

export async function loader() {
  await new Promise((resolve) => setTimeout(resolve, 5));
  redirect("/login", { status: 303 });
}

export default function Page() {
  return <main>should not render</main>;
}`,
    );
    await buildApp({ appDir, outDir, targets: ["node"] });
    const events: AppRouterLogEvent[] = [];
    const logger: AppRouterLogger = {
      debug(event) {
        events.push(event);
      },
    };
    const handler = createAwsLambdaRequestHandler({ logger, outDir, timings: true });

    const result = await handler(lambdaEvent("/"));

    expect(result.statusCode).toBe(303);
    await eventually(() => {
      expect(events.some((event) => event.type === "router:render:timing")).toBe(true);
    });
    const renderTiming = events.find((event) => event.type === "router:render:timing");
    if (renderTiming?.type !== "router:render:timing") {
      throw new Error("expected render timing event");
    }
    expect(renderTiming.phases).toEqual(
      expect.objectContaining({
        loaderExecutionMs: expect.any(Number),
        loaderModuleLoadMs: expect.any(Number),
        loaderWaitMs: expect.any(Number),
      }),
    );
    expect(renderTiming.phases).not.toHaveProperty("stringTransformMs");
  });

  test("emits render timing when built middleware redirects before route render", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-middleware-redirect-timing-");
    await writeFile(
      join(appDir, "middleware.ts"),
      `export function middleware() {
  return new Response(null, { status: 303, headers: { location: "/login" } });
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>should not render</main>;
}`,
    );
    await buildApp({ appDir, outDir, targets: ["node"] });
    const events: AppRouterLogEvent[] = [];
    const logger: AppRouterLogger = {
      debug(event) {
        events.push(event);
      },
    };
    const handler = createAwsLambdaRequestHandler({ logger, outDir, timings: true });

    const result = await handler(lambdaEvent("/login"));

    expect(result.statusCode).toBe(303);
    await eventually(() => {
      expect(events.some((event) => event.type === "router:render:timing")).toBe(true);
    });
    const renderTiming = events.find((event) => event.type === "router:render:timing");
    expect(renderTiming).toMatchObject({
      method: "GET",
      path: "/login",
      status: 303,
      type: "router:render:timing",
    });
    if (renderTiming?.type !== "router:render:timing") {
      throw new Error("expected render timing event");
    }
    expect(renderTiming.phases).toEqual(
      expect.objectContaining({
        middlewareExecutionMs: expect.any(Number),
        middlewareModuleLoadMs: expect.any(Number),
        middlewareMs: expect.any(Number),
      }),
    );
    expect(renderTiming.phases).not.toHaveProperty("loaderModuleLoadMs");
    expect(renderTiming.phases).not.toHaveProperty("pageRenderMs");
  });

  test("splits buffered response timing into stream drain and body encode phases", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-buffered-stream-timings-");
    await mkdir(join(appDir, "api", "slow"), { recursive: true });
    await writeFile(
      join(appDir, "api", "slow", "route.ts"),
      `export function GET() {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("slow "));
      setTimeout(() => {
        controller.enqueue(encoder.encode("body"));
        controller.close();
      }, 10);
    },
  }), { headers: { "content-type": "text/plain; charset=utf-8" } });
}`,
    );
    await buildApp({ appDir, outDir });
    const events: AppRouterLogEvent[] = [];
    const logger: AppRouterLogger = {
      debug(event) {
        events.push(event);
      },
    };
    const handler = createAwsLambdaRequestHandler({ logger, outDir, timings: true });

    const result = await handler(lambdaEvent("/api/slow"));

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe("slow body");
    await eventually(() => {
      expect(events).toHaveLength(1);
    });
    const timing = events[0];
    if (timing?.type !== "router:request:timing") {
      throw new Error("expected timing event");
    }
    expect(timing.phases.responseSerializationMs).toBeGreaterThanOrEqual(0);
    expect(timing.phases.streamDrainMs).toBeGreaterThanOrEqual(0);
    expect(timing.phases.streamReadMs).toBeGreaterThanOrEqual(0);
    expect(timing.phases.streamConcatMs).toBeGreaterThanOrEqual(0);
    expect(timing.phases.bodyEncodeMs).toBeGreaterThanOrEqual(0);
  });

  test("does not emit AWS Lambda phase timings by default", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-no-timings-");
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>Default Lambda</main>;
}`,
    );
    await buildApp({ appDir, outDir });
    const events: AppRouterLogEvent[] = [];
    const logger: AppRouterLogger = {
      debug(event) {
        events.push(event);
      },
    };
    const handler = createAwsLambdaRequestHandler({ logger, outDir });

    const result = await handler(lambdaEvent("/"));

    expect(result.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual([]);
  });

  test("materializes runtime files outside outDir and links deployed node_modules", async () => {
    const { outDir, appDir, rootDir } = await createBuiltApp("mreact-lambda-runtime-dir-");
    await mkdir(join(rootDir, "node_modules", "lambda-message"), { recursive: true });
    await writeFile(
      join(rootDir, "node_modules", "lambda-message", "package.json"),
      JSON.stringify({ name: "lambda-message", type: "module", exports: "./index.js" }),
    );
    await writeFile(
      join(rootDir, "node_modules", "lambda-message", "index.js"),
      'export const message = "Hello writable Lambda";\n',
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { message } from "lambda-message";

export default function Page() {
  return <main>{message}</main>;
}`,
    );
    await buildApp({ appDir, outDir });
    const runtimeDir = join(rootDir, "lambda-runtime");
    const handler = createAwsLambdaRequestHandler({ outDir, runtimeDir });

    const result = await handler(lambdaEvent("/"));
    const nodeModulesStats = await lstat(join(runtimeDir, "node_modules"));

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("<main>Hello writable Lambda</main>");
    expect(nodeModulesStats.isSymbolicLink()).toBe(true);
    await expect(access(join(runtimeDir, "app", "page.tsx"))).resolves.toBeUndefined();
    await expect(access(join(outDir, "server", "runtime", "app"))).rejects.toThrow();
  });

  test("accepts the generated build import policy", async () => {
    const { outDir, appDir, rootDir } = await createBuiltApp("mreact-lambda-generated-policy-");
    await writeFile(
      join(rootDir, "package.json"),
      JSON.stringify({ dependencies: { "lambda-title": "1.0.0" } }),
    );
    await mkdir(join(rootDir, "node_modules", "lambda-title"), { recursive: true });
    await writeFile(
      join(rootDir, "node_modules", "lambda-title", "package.json"),
      JSON.stringify({ name: "lambda-title", type: "module", exports: "./index.js" }),
    );
    await writeFile(
      join(rootDir, "node_modules", "lambda-title", "index.js"),
      'export const title = "Generated import policy";\n',
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { title } from "lambda-title";

export default function Page() {
  return <main>{title}</main>;
}`,
    );
    await buildApp({
      allowedSourceDirs: ["app"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["node"],
    });
    const handler = createAwsLambdaRequestHandler({ importPolicy: "generated", outDir });

    const result = await handler(lambdaEvent("/"));

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("<main>Generated import policy</main>");
  });

  test("unions generated import policy runtime packages with user allowed packages", async () => {
    const { outDir, appDir, rootDir } = await createBuiltApp(
      "mreact-lambda-generated-policy-union-",
    );
    await writeFile(
      join(rootDir, "package.json"),
      JSON.stringify({ dependencies: { "lambda-title": "1.0.0" } }),
    );
    await mkdir(join(rootDir, "node_modules", "lambda-title"), { recursive: true });
    await writeFile(
      join(rootDir, "node_modules", "lambda-title", "package.json"),
      JSON.stringify({ name: "lambda-title", type: "module", exports: "./index.js" }),
    );
    await writeFile(
      join(rootDir, "node_modules", "lambda-title", "index.js"),
      'export const title = "Generated policy union";\n',
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { title } from "lambda-title";

export default function Page() {
  return <main>{title}</main>;
}`,
    );
    await buildApp({
      allowedSourceDirs: ["app"],
      outDir,
      projectRoot: rootDir,
      routesDir: "app",
      targets: ["node"],
    });
    const handler = createAwsLambdaRequestHandler({
      importPolicy: { allowedPackages: ["user-audit-package"] },
      outDir,
    });

    const result = await handler(lambdaEvent("/"));

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("<main>Generated policy union</main>");
  });

  test("does not block the first request on unused route preload work", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-preload-background-");
    await mkdir(join(appDir, "healthz"), { recursive: true });
    await mkdir(join(appDir, "slow"), { recursive: true });
    await writeFile(
      join(appDir, "healthz", "page.tsx"),
      `export default function Healthz() {
  return <main>ok</main>;
}`,
    );
    await writeFile(
      join(appDir, "slow", "page.tsx"),
      `globalThis.__mreactSlowPreloadStarted = (globalThis.__mreactSlowPreloadStarted ?? 0) + 1;
await new Promise((resolve) => setTimeout(resolve, 500));

export async function loader() {
  return { message: "slow" };
}

export default function Slow(props) {
  return <main>{props.data.message}</main>;
}`,
    );
    await buildApp({ appDir, outDir, targets: ["node"] });
    const handler = createAwsLambdaRequestHandler({ outDir });
    const started = performance.now();

    const result = await handler(lambdaEvent("/healthz"));
    const elapsedMs = performance.now() - started;

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("<main>ok</main>");
    expect(elapsedMs).toBeLessThan(250);
    await new Promise((resolve) => setTimeout(resolve, 550));
  });

  test("preloaded handler awaits built runtime preload before returning", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-preloaded-handler-");
    await mkdir(join(appDir, "slow"), { recursive: true });
    await writeFile(
      join(appDir, "slow", "page.tsx"),
      `const state = globalThis;
state.__mreactPreloadedLambda = [...(state.__mreactPreloadedLambda ?? []), "slow-page"];

export default function Slow() {
  return <main>slow</main>;
}`,
    );
    const state = globalThis as { __mreactPreloadedLambda?: string[] | undefined };
    state.__mreactPreloadedLambda = [];

    await buildApp({ appDir, outDir, targets: ["node"] });
    const handler = await createPreloadedAwsLambdaRequestHandler({ outDir });

    expect(state.__mreactPreloadedLambda).toEqual(["slow-page"]);
    const result = await handler(lambdaEvent("/slow"));
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("<main>slow</main>");
    expect(state.__mreactPreloadedLambda).toEqual(["slow-page"]);
  });

  test("can disable AWS Lambda background preload", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-preload-none-");
    await mkdir(join(appDir, "healthz"), { recursive: true });
    await mkdir(join(appDir, "slow"), { recursive: true });
    await writeFile(
      join(appDir, "healthz", "page.tsx"),
      `export default function Healthz() {
  return <main>ok</main>;
}`,
    );
    await writeFile(
      join(appDir, "slow", "page.tsx"),
      `globalThis.__mreactNoPreloadLoaded = (globalThis.__mreactNoPreloadLoaded ?? 0) + 1;

export default function Slow() {
  return <main>slow</main>;
}`,
    );
    const state = globalThis as { __mreactNoPreloadLoaded?: number | undefined };
    state.__mreactNoPreloadLoaded = 0;

    await buildApp({ appDir, outDir, targets: ["node"] });
    const handler = createAwsLambdaRequestHandler({ outDir, preload: "none" });

    const result = await handler(lambdaEvent("/healthz"));

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("<main>ok</main>");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(state.__mreactNoPreloadLoaded).toBe(0);
  });

  test("defaults direct AWS Lambda background preload to middleware only", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-default-preload-");
    await mkdir(join(appDir, "healthz"), { recursive: true });
    await mkdir(join(appDir, "slow"), { recursive: true });
    await writeFile(
      join(appDir, "middleware.ts"),
      `globalThis.__mreactDefaultPreload = [
  ...(globalThis.__mreactDefaultPreload ?? []),
  "middleware-module",
];

export const config = { matcher: "/admin/:path*" };

export function middleware() {}
`,
    );
    await writeFile(
      join(appDir, "healthz", "page.tsx"),
      `export default function Healthz() {
  return <main>ok</main>;
}`,
    );
    await writeFile(
      join(appDir, "slow", "page.tsx"),
      `globalThis.__mreactDefaultPreload = [
  ...(globalThis.__mreactDefaultPreload ?? []),
  "slow-page-module",
];

export default function Slow() {
  return <main>slow</main>;
}`,
    );
    const state = globalThis as { __mreactDefaultPreload?: string[] | undefined };
    state.__mreactDefaultPreload = [];

    await buildApp({ appDir, outDir, targets: ["node"] });
    const handler = createAwsLambdaRequestHandler({ outDir });

    const result = await handler(lambdaEvent("/healthz"));

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("<main>ok</main>");
    await eventually(() => {
      expect(state.__mreactDefaultPreload).toContain("middleware-module");
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(state.__mreactDefaultPreload).not.toContain("slow-page-module");
  });

  test("preloaded AWS Lambda handler can await only configured hot routes", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-preload-hot-routes-");
    await mkdir(join(appDir, "hot"), { recursive: true });
    await mkdir(join(appDir, "slow"), { recursive: true });
    await writeFile(
      join(appDir, "hot", "page.tsx"),
      `globalThis.__mreactHotRoutePreload = [...(globalThis.__mreactHotRoutePreload ?? []), "hot"];

export default function Hot() {
  return <main>hot</main>;
}`,
    );
    await writeFile(
      join(appDir, "slow", "page.tsx"),
      `globalThis.__mreactHotRoutePreload = [...(globalThis.__mreactHotRoutePreload ?? []), "slow"];

export default function Slow() {
  return <main>slow</main>;
}`,
    );
    const state = globalThis as { __mreactHotRoutePreload?: string[] | undefined };
    state.__mreactHotRoutePreload = [];

    await buildApp({ appDir, outDir, targets: ["node"] });
    const handler = await createPreloadedAwsLambdaRequestHandler({
      outDir,
      preload: { mode: "hot-routes", routes: ["/hot"] },
    });

    expect(state.__mreactHotRoutePreload).toEqual(["hot"]);
    const result = await handler(lambdaEvent("/slow"));
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("<main>slow</main>");
    expect(state.__mreactHotRoutePreload).toEqual(["hot", "slow"]);
  });

  test("preloaded AWS Lambda handler can warm only hot route request modules", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-preload-hot-route-requests-");
    await mkdir(join(appDir, "hot"), { recursive: true });
    await writeFile(
      join(appDir, "hot", "loader-dependency.ts"),
      `export function message() {
  return "hot";
}`,
    );
    await writeFile(
      join(appDir, "hot", "page-dependency.ts"),
      `globalThis.__mreactHotRouteRequestPreload = [
  ...(globalThis.__mreactHotRouteRequestPreload ?? []),
  "page-module",
];

export function renderMessage(value) {
  return value;
}`,
    );
    await writeFile(
      join(appDir, "hot", "page.tsx"),
      `import { message } from "./loader-dependency";
import { renderMessage } from "./page-dependency";

export function loader() {
  globalThis.__mreactHotRouteRequestPreload = [
    ...(globalThis.__mreactHotRouteRequestPreload ?? []),
    "loader",
  ];
  return { message: "hot" };
}

export default function Hot({ data }) {
  return <main>{renderMessage(data.message)}</main>;
}`,
    );
    const state = globalThis as { __mreactHotRouteRequestPreload?: string[] | undefined };
    state.__mreactHotRouteRequestPreload = [];

    await buildApp({ appDir, outDir, targets: ["node"] });
    const handler = await createPreloadedAwsLambdaRequestHandler({
      outDir,
      preload: { mode: "hot-route-requests", routes: ["/hot"] },
    });
    const manifest = JSON.parse(await readFile(join(outDir, "server", "manifest.json"), "utf8")) as {
      serverModuleRequestFiles?: Record<string, string>;
    };
    const requestArtifact = manifest.serverModuleRequestFiles?.["hot/page.tsx"];
    expect(requestArtifact).toMatch(/^server-modules\/request\/[a-f0-9]{16}\.json$/);
    await rm(join(outDir, "server", requestArtifact ?? ""));

    expect(state.__mreactHotRouteRequestPreload).toEqual([]);
    const result = await handler(lambdaEvent("/hot"));
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("<main>hot</main>");
    expect(state.__mreactHotRouteRequestPreload).toEqual(["loader", "page-module"]);
  });

  test("can wait for AWS Lambda hot route preload on the first request", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-preload-first-request-");
    await mkdir(join(appDir, "hot"), { recursive: true });
    await writeFile(
      join(appDir, "hot", "page.tsx"),
      `await new Promise((resolve) => setTimeout(resolve, 80));
globalThis.__mreactFirstRequestPreload = [
  ...(globalThis.__mreactFirstRequestPreload ?? []),
  "page-module",
];

export function loader() {
  globalThis.__mreactFirstRequestPreload = [
    ...(globalThis.__mreactFirstRequestPreload ?? []),
    "loader",
  ];
  return { message: "hot" };
}

export default function Hot({ data }) {
  return <main>{data.message}</main>;
}`,
    );
    const state = globalThis as { __mreactFirstRequestPreload?: string[] | undefined };
    state.__mreactFirstRequestPreload = [];
    const events: AppRouterLogEvent[] = [];
    const logger: AppRouterLogger = {
      debug(event) {
        events.push(event);
      },
    };

    await buildApp({ appDir, outDir, targets: ["node"] });
    const handler = createAwsLambdaRequestHandler({
      logger,
      outDir,
      preload: { mode: "hot-routes", routes: ["/hot"], wait: "first-request" },
      timings: true,
    });

    const result = await handler(lambdaEvent("/hot"));

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("<main>hot</main>");
    expect(state.__mreactFirstRequestPreload).toContain("page-module");
    expect(state.__mreactFirstRequestPreload).toContain("loader");
    await eventually(() => {
      expect(events.some((event) => event.type === "router:request:timing")).toBe(true);
      expect(events.some((event) => event.type === "router:render:timing")).toBe(true);
    });
    const requestTiming = events.find((event) => event.type === "router:request:timing");
    if (requestTiming?.type !== "router:request:timing") {
      throw new Error("expected request timing event");
    }
    expect(requestTiming.phases.preloadWaitMs).toBeGreaterThanOrEqual(70);
    const renderTiming = events.find((event) => event.type === "router:render:timing");
    if (renderTiming?.type !== "router:render:timing") {
      throw new Error("expected render timing event");
    }
    expect(renderTiming.phases.pageModuleLoadMs).toBeLessThan(40);
  });

  test("can wait for AWS Lambda hot route preload before page render only", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-preload-before-render-");
    const globalGate = globalThis as typeof globalThis & {
      __mreactLambdaPreloadGate?: { open: boolean; waiters: Array<() => void> } | undefined;
    };
    delete globalGate.__mreactLambdaPreloadGate;
    await mkdir(join(appDir, "hot"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { redirect } from "@reckona/mreact-router";

export function loader() {
  redirect("/login", { status: 303 });
}

export default function Page() {
  return <main>root</main>;
}`,
    );
    // The hot page blocks on a gate the test controls, so the preload can
    // only complete after the test opens it. A redirect that waited for the
    // preload would never resolve, making the no-wait property deterministic
    // instead of a load-sensitive wall-clock bound.
    await writeFile(
      join(appDir, "hot", "page.tsx"),
      `const gate = (globalThis.__mreactLambdaPreloadGate ??= { open: false, waiters: [] });
if (!gate.open) {
  await new Promise((resolve) => {
    gate.waiters.push(resolve);
  });
}

export function loader() {
  return { message: "hot" };
}

export default function Hot({ data }) {
  return <main>{data.message}</main>;
}`,
    );
    const events: AppRouterLogEvent[] = [];
    const logger: AppRouterLogger = {
      debug(event) {
        events.push(event);
      },
    };

    try {
      await buildApp({ appDir, outDir, targets: ["node"] });
      const handler = createAwsLambdaRequestHandler({
        logger,
        outDir,
        preload: { mode: "hot-routes", routes: ["/hot"], wait: "before-render" },
        timings: true,
      });

      const redirectResult = await handler(lambdaEvent("/"));

      expect(redirectResult.statusCode).toBe(303);
      await eventually(() => {
        expect(events.some((event) => event.type === "router:render:timing")).toBe(true);
      });
      const redirectTiming = events.find((event) => event.type === "router:render:timing");
      if (redirectTiming?.type !== "router:render:timing") {
        throw new Error("expected redirect render timing event");
      }
      expect(redirectTiming.phases.preloadWaitMs).toBeUndefined();
      // The redirect fast path must not touch render work either: page module
      // execution and render artifact loading only happen on rendered routes.
      expect(redirectTiming.phases).not.toHaveProperty("pageModuleLoadMs");
      expect(redirectTiming.phases).not.toHaveProperty("renderArtifactLoadMs");
      expect(redirectTiming.phases).not.toHaveProperty("pageComponentRenderMs");

      // The redirect resolved while the hot preload is still parked on the
      // gate; the preload has started but cannot have finished.
      await eventually(() => {
        expect(globalGate.__mreactLambdaPreloadGate?.waiters.length ?? 0).toBeGreaterThan(0);
      });
      expect(globalGate.__mreactLambdaPreloadGate?.open).toBe(false);
      openPreloadGate(globalGate.__mreactLambdaPreloadGate);

      events.length = 0;
      const hotResult = await handler(lambdaEvent("/hot"));

      expect(hotResult.statusCode).toBe(200);
      expect(hotResult.body).toContain("<main>hot</main>");
      await eventually(() => {
        expect(events.some((event) => event.type === "router:render:timing")).toBe(true);
      });
      const hotTiming = events.find((event) => event.type === "router:render:timing");
      if (hotTiming?.type !== "router:render:timing") {
        throw new Error("expected hot render timing event");
      }
      expect(hotTiming.phases.preloadWaitMs ?? 0).toBeGreaterThanOrEqual(0);
      expect(hotTiming.phases.pageModuleLoadMs).toBeLessThan(40);
    } finally {
      openPreloadGate(globalGate.__mreactLambdaPreloadGate);
      delete globalGate.__mreactLambdaPreloadGate;
    }
  });

  test("forwards method, body, headers, cookies, and query string to route handlers", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-route-");
    await mkdir(join(appDir, "api", "echo"), { recursive: true });
    await writeFile(
      join(appDir, "api", "echo", "route.ts"),
      `export async function POST(request) {
  return Response.json({
    body: await request.text(),
    cookie: request.headers.get("cookie"),
    method: request.method,
    testHeader: request.headers.get("x-test"),
    url: request.url,
  });
}`,
    );
    await buildApp({ appDir, outDir });
    const handler = createAwsLambdaRequestHandler({ outDir });

    const result = await handler({
      body: "hello",
      cookies: ["a=1", "b=2"],
      headers: {
        "content-type": "text/plain",
        host: "lambda.test",
        "x-forwarded-proto": "https",
        "x-test": "route",
      },
      rawPath: "/api/echo",
      rawQueryString: "x=1",
      requestContext: {
        http: {
          method: "POST",
        },
      },
      version: "2.0",
    });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      body: "hello",
      cookie: "a=1; b=2",
      method: "POST",
      testHeader: "route",
      url: "https://lambda.test/api/echo?x=1",
    });
  });

  test("reuses materialized built runtime on warm requests without rereading manifests", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-warm-runtime-cache-");
    await mkdir(join(appDir, "api", "ping"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>warm page</main>;
}`,
    );
    await writeFile(
      join(appDir, "api", "ping", "route.ts"),
      `export function GET() {
  return new Response("pong");
}`,
    );
    await buildApp({ appDir, outDir, targets: ["node"] });
    const handler = createAwsLambdaRequestHandler({ outDir });

    const first = await handler(lambdaEvent("/"));
    expect(first.statusCode).toBe(200);
    expect(first.body).toContain("<main>warm page</main>");

    await rename(
      join(outDir, "server", "manifest.json"),
      join(outDir, "server", "manifest.json.moved"),
    );
    await rename(
      join(outDir, "client", "manifest.json"),
      join(outDir, "client", "manifest.json.moved"),
    );

    const second = await handler(lambdaEvent("/api/ping"));

    expect(second.statusCode).toBe(200);
    expect(second.body).toBe("pong");
  });

  test("returns Set-Cookie headers through the Lambda cookies field", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-cookies-");
    await mkdir(join(appDir, "api", "cookies"), { recursive: true });
    await writeFile(
      join(appDir, "api", "cookies", "route.ts"),
      `export function GET() {
  const headers = new Headers();
  headers.append("set-cookie", "a=1; Path=/; HttpOnly");
  headers.append("set-cookie", "b=2; Path=/; SameSite=Lax");
  return new Response("ok", { headers });
}`,
    );
    await buildApp({ appDir, outDir });
    const handler = createAwsLambdaRequestHandler({ outDir });

    const result = await handler(lambdaEvent("/api/cookies"));

    expect(result.statusCode).toBe(200);
    expect(result.cookies).toEqual(["a=1; Path=/; HttpOnly", "b=2; Path=/; SameSite=Lax"]);
    expect(result.headers?.["set-cookie"]).toBeUndefined();
  });

  test("encodes binary responses as base64", async () => {
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-binary-");
    await mkdir(join(appDir, "api", "bytes"), { recursive: true });
    await writeFile(
      join(appDir, "api", "bytes", "route.ts"),
      `export function GET() {
  return new Response(new Uint8Array([0, 1, 2]), {
    headers: { "content-type": "application/octet-stream" },
  });
}`,
    );
    await buildApp({ appDir, outDir });
    const handler = createAwsLambdaRequestHandler({ outDir });

    const result = await handler(lambdaEvent("/api/bytes"));

    expect(result.statusCode).toBe(200);
    expect(result.isBase64Encoded).toBe(true);
    expect(result.body).toBe("AAEC");
  });

  test("streams text response chunks with status, headers, and cookies", async () => {
    installAwsLambdaStreamingMock();
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-stream-");
    await mkdir(join(appDir, "api", "stream"), { recursive: true });
    await writeFile(
      join(appDir, "api", "stream", "route.ts"),
      `export function GET() {
  const encoder = new TextEncoder();
  const headers = new Headers({ "content-type": "text/plain; charset=utf-8", "x-test": "stream" });
  headers.append("set-cookie", "sid=1; Path=/; HttpOnly");
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("hello "));
      controller.enqueue(encoder.encode("stream"));
      controller.close();
    },
  }), { headers, status: 201 });
}`,
    );
    await buildApp({ appDir, outDir });
    const handler = createAwsLambdaStreamingRequestHandler({ outDir });
    const stream = createTestLambdaResponseStream();

    await handler(lambdaEvent("/api/stream"), stream, {});

    expect(stream.metadata).toEqual({
      cookies: ["sid=1; Path=/; HttpOnly"],
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-test": "stream",
      },
      statusCode: 201,
    });
    expect(stream.text()).toBe("hello stream");
    expect(stream.ended).toBe(true);
  });

  test("splits streaming response timing into stream wait and write phases", async () => {
    installAwsLambdaStreamingMock();
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-stream-timings-");
    await mkdir(join(appDir, "api", "stream"), { recursive: true });
    await writeFile(
      join(appDir, "api", "stream", "route.ts"),
      `export function GET() {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("hello "));
      setTimeout(() => {
        controller.enqueue(encoder.encode("stream"));
        controller.close();
      }, 10);
    },
  }), { headers: { "content-type": "text/plain; charset=utf-8" } });
}`,
    );
    await buildApp({ appDir, outDir });
    const events: AppRouterLogEvent[] = [];
    const logger: AppRouterLogger = {
      debug(event) {
        events.push(event);
      },
    };
    const handler = createAwsLambdaStreamingRequestHandler({ logger, outDir, timings: true });
    const stream = createTestLambdaResponseStream();

    await handler(lambdaEvent("/api/stream"), stream, {});

    expect(stream.text()).toBe("hello stream");
    expect(stream.ended).toBe(true);
    await eventually(() => {
      expect(events).toHaveLength(1);
    });
    const timing = events[0];
    if (timing?.type !== "router:request:timing") {
      throw new Error("expected timing event");
    }
    expect(timing.phases.responseStreamingMs).toBeGreaterThanOrEqual(0);
    expect(timing.phases.streamWaitMs).toBeGreaterThanOrEqual(0);
    expect(timing.phases.streamWriteMs).toBeGreaterThanOrEqual(0);
  });

  test("streams binary response bytes without base64 buffering", async () => {
    installAwsLambdaStreamingMock();
    const { outDir, appDir } = await createBuiltApp("mreact-lambda-stream-binary-");
    await mkdir(join(appDir, "api", "bytes"), { recursive: true });
    await writeFile(
      join(appDir, "api", "bytes", "route.ts"),
      `export function GET() {
  return new Response(new Uint8Array([0, 1, 2]), {
    headers: { "content-type": "application/octet-stream" },
  });
}`,
    );
    await buildApp({ appDir, outDir });
    const handler = createAwsLambdaStreamingRequestHandler({ outDir });
    const stream = createTestLambdaResponseStream();

    await handler(lambdaEvent("/api/bytes"), stream, {});

    expect(stream.metadata?.headers["content-type"]).toBe("application/octet-stream");
    expect(Buffer.concat(stream.chunks)).toEqual(Buffer.from([0, 1, 2]));
    expect(stream.ended).toBe(true);
  });

  test("applies onResponse to error handler output when rendering fails", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-lambda-error-hook-"));
    const handler = createAwsLambdaRequestHandler({
      errorHandler: () => ({
        body: "failed",
        status: 503,
      }),
      onResponse(response) {
        response.headers.set("x-response-hook", "applied");
      },
      outDir: join(rootDir, "missing"),
    });

    const response = await handler(lambdaEvent("/"));

    expect(response.statusCode).toBe(503);
    expect(response.headers?.["x-response-hook"]).toBe("applied");
    expect(response.body).toBe("failed");
  });

  test("streams error handler output when rendering fails before headers", async () => {
    installAwsLambdaStreamingMock();
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-lambda-stream-error-"));
    const handler = createAwsLambdaStreamingRequestHandler({
      errorHandler: () => ({
        body: "stream failed",
        headers: { "x-error": "handled" },
        status: 503,
      }),
      onResponse(response) {
        response.headers.set("x-response-hook", "applied");
      },
      outDir: join(rootDir, "missing"),
    });
    const stream = createTestLambdaResponseStream();

    await handler(lambdaEvent("/"), stream, {});

    expect(stream.metadata).toEqual({
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-error": "handled",
        "x-response-hook": "applied",
      },
      statusCode: 503,
    });
    expect(stream.text()).toBe("stream failed");
    expect(stream.ended).toBe(true);
  });
});

async function createBuiltApp(
  prefix: string,
): Promise<{ appDir: string; outDir: string; rootDir: string }> {
  const rootDir = await mkdtemp(join(tmpdir(), prefix));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(appDir, { recursive: true });

  return { appDir, outDir, rootDir };
}

async function writeUrlEchoRoute(appDir: string): Promise<void> {
  await writeFile(
    join(appDir, "route.ts"),
    `export function GET(request) {
  return Response.json({ url: request.url });
}`,
  );
}

async function withNodeEnv<T>(value: string, task: () => Promise<T>): Promise<T> {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = value;

  try {
    return await task();
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous;
    }
  }
}

function lambdaEvent(rawPath: string): AwsLambdaHttpEventV2 {
  return {
    headers: {
      host: "lambda.test",
      "x-forwarded-proto": "https",
    },
    rawPath,
    rawQueryString: "",
    requestContext: {
      http: {
        method: "GET",
      },
    },
    version: "2.0",
  };
}

interface TestLambdaResponseStream {
  chunks: Buffer[];
  ended: boolean;
  metadata?: {
    cookies?: string[] | undefined;
    headers: Record<string, string>;
    statusCode: number;
  };
  write(chunk: string | Uint8Array): boolean;
  end(): void;
  text(): string;
}

function createTestLambdaResponseStream(): TestLambdaResponseStream {
  return {
    chunks: [],
    ended: false,
    write(chunk) {
      this.chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
      return true;
    },
    end() {
      this.ended = true;
    },
    text() {
      return Buffer.concat(this.chunks).toString("utf8");
    },
  };
}

function installAwsLambdaStreamingMock(): void {
  (globalThis as { awslambda?: unknown }).awslambda = {
    HttpResponseStream: {
      from(
        stream: TestLambdaResponseStream,
        metadata: TestLambdaResponseStream["metadata"],
      ) {
        stream.metadata = metadata;
        return stream;
      },
    },
    streamifyResponse(handler: unknown) {
      return handler;
    },
  };
}

function openPreloadGate(
  gate: { open: boolean; waiters: Array<() => void> } | undefined,
): void {
  if (gate === undefined) {
    return;
  }

  gate.open = true;
  const waiters = gate.waiters.splice(0);
  for (const waiter of waiters) {
    waiter();
  }
}

async function eventually(assertion: () => void): Promise<void> {
  const started = performance.now();
  let lastError: unknown;

  while (performance.now() - started < 500) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}
