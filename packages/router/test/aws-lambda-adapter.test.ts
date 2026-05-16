import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import {
  createAwsLambdaRequestHandler,
  type AwsLambdaHttpEventV2,
} from "../src/adapters/aws-lambda.js";

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
});

async function createBuiltApp(prefix: string): Promise<{ appDir: string; outDir: string }> {
  const rootDir = await mkdtemp(join(tmpdir(), prefix));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(appDir, { recursive: true });

  return { appDir, outDir };
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
