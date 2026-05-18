import { access, lstat, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import {
  createAwsLambdaRequestHandler,
  createAwsLambdaStreamingRequestHandler,
  type AwsLambdaHttpEventV2,
} from "../src/adapters/aws-lambda.js";

const originalAwsLambda = (globalThis as { awslambda?: unknown }).awslambda;

afterEach(() => {
  (globalThis as { awslambda?: unknown }).awslambda = originalAwsLambda;
});

describe("mreact AWS Lambda adapter", () => {
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

  test("streams error handler output when rendering fails before headers", async () => {
    installAwsLambdaStreamingMock();
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-lambda-stream-error-"));
    const handler = createAwsLambdaStreamingRequestHandler({
      errorHandler: () => ({
        body: "stream failed",
        headers: { "x-error": "handled" },
        status: 503,
      }),
      outDir: join(rootDir, "missing"),
    });
    const stream = createTestLambdaResponseStream();

    await handler(lambdaEvent("/"), stream, {});

    expect(stream.metadata).toEqual({
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-error": "handled",
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
