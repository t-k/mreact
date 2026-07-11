import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import type {
  AwsLambdaHttpEventV2,
  AwsLambdaStreamingResponseMetadata,
  AwsLambdaStreamingResponseStream,
} from "../../packages/router/src/adapters/aws-lambda.js";
import type { AppRouterLogEvent, AppRouterLogger } from "../../packages/router/src/logger.js";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { createDatedResultsDir, writeJsonFile, writeTextFile } from "../shared/results.js";
import { formatLambdaRouteLatencyMarkdown } from "./report.js";
import type { LambdaRouteLatencyRow } from "./types.js";

const simulatedLoaderMs = readNumberEnv("MREACT_LAMBDA_BENCH_LOADER_MS", 25);
const simulatedMiddlewareMs = readNumberEnv("MREACT_LAMBDA_BENCH_MIDDLEWARE_MS", 10);
const repeatCount = readNumberEnv("MREACT_LAMBDA_BENCH_REPEATS", 3);
const targetRoot = process.env.MREACT_LAMBDA_BENCH_TARGET_ROOT ?? process.cwd();
const { buildApp } = (await import(
  pathToFileURL(join(targetRoot, "packages/router/dist/build.js")).href
)) as typeof import("../../packages/router/src/build.js");
const { createAwsLambdaRequestHandler, createAwsLambdaStreamingRequestHandler } = (await import(
  pathToFileURL(join(targetRoot, "packages/router/dist/adapters/aws-lambda.js")).href
)) as typeof import("../../packages/router/src/adapters/aws-lambda.js");
const rootDir = await mkdtemp(join(tmpdir(), "mreact-lambda-route-latency-"));
const appDir = join(rootDir, "app");
const outDir = join(rootDir, ".mreact");

await writeFixtureApp(appDir, {
  simulatedLoaderMs,
  simulatedMiddlewareMs,
});
await buildApp({ appDir, outDir, targets: ["node"] });

const events: AppRouterLogEvent[] = [];
const logger: AppRouterLogger = {
  debug(event) {
    events.push(event);
  },
  error(event) {
    events.push(event);
  },
};
const handler = createAwsLambdaRequestHandler({
  logger,
  outDir,
  timings: true,
});
installAwsLambdaStreamingMock();
const streamingHandler = createAwsLambdaStreamingRequestHandler({
  logger,
  outDir,
  timings: true,
});

const rows: LambdaRouteLatencyRow[] = [];

rows.push(await invokeScenario(handler, events, "cold-healthz", "/healthz", 1));
rows.push(await invokeStreamingScenario(streamingHandler, events, "streaming-healthz", "/healthz", 1));
rows.push(await invokeScenario(handler, events, "first-root-redirect", "/", 1));

for (let index = 1; index <= repeatCount; index += 1) {
  rows.push(await invokeScenario(handler, events, "warm-root-redirect", "/", index));
}

rows.push(await invokeScenario(handler, events, "first-login", "/login", 1));

// AWS Lambda target app where middleware and route loaders share one heavy
// runtime package. Measures per-environment route first hits, cross-route
// first hits, and same-route re-hits against the lambda artifact layout.
const sharedRootDir = await mkdtemp(join(tmpdir(), "mreact-lambda-shared-runtime-pkg-"));

await writeSharedRuntimePackageFixtureApp(sharedRootDir);
await buildApp({
  allowedSourceDirs: ["app"],
  outDir: join(sharedRootDir, ".mreact"),
  projectRoot: sharedRootDir,
  routesDir: "app",
  targets: ["aws-lambda"],
});

const sharedPackageHandler = createAwsLambdaRequestHandler({
  logger,
  outDir: join(sharedRootDir, ".mreact"),
  timings: true,
});

rows.push(await invokeScenario(sharedPackageHandler, events, "shared-pkg-first-users", "/users", 1));
rows.push(
  await invokeScenario(sharedPackageHandler, events, "shared-pkg-cross-route-families", "/families", 1),
);
rows.push(await invokeScenario(sharedPackageHandler, events, "shared-pkg-cross-route-root", "/", 1));

for (let index = 1; index <= repeatCount; index += 1) {
  rows.push(await invokeScenario(sharedPackageHandler, events, "shared-pkg-rehit-users", "/users", index));
}

const env = await collectBenchmarkEnvironment(["@reckona/mreact-router"]);
const dir = await createDatedResultsDir();
const targetCommit = execFileSync("git", ["-C", targetRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const markdown = formatLambdaRouteLatencyMarkdown(env, rows).replace(
  "## Environment",
  `## Environment\n\n- Target commit: ${targetCommit}`,
);

await writeJsonFile(join(dir, "lambda-route-latency.summary.json"), {
  buildMode: "production",
  environment: env,
  rows,
  targetCommit,
});
await writeTextFile(join(dir, "lambda-route-latency.md"), markdown);

console.log(markdown);

async function writeFixtureApp(
  directory: string,
  options: {
    simulatedLoaderMs: number;
    simulatedMiddlewareMs: number;
  },
): Promise<void> {
  await mkdir(join(directory, "healthz"), { recursive: true });
  await mkdir(join(directory, "login"), { recursive: true });

  await writeFile(
    join(directory, "middleware.ts"),
    `export const config = { matcher: "/admin/:path*" };

export async function middleware() {
  await new Promise((resolve) => setTimeout(resolve, ${options.simulatedMiddlewareMs}));
}
`,
  );
  await writeFile(
    join(directory, "page.tsx"),
    `import { redirect } from "@reckona/mreact-router";

export async function loader() {
  await new Promise((resolve) => setTimeout(resolve, ${options.simulatedLoaderMs}));
  redirect("/login", { status: 303 });
}

export default function Page() {
  return <main>root</main>;
}
`,
  );
  await writeFile(
    join(directory, "login", "page.tsx"),
    `import { redirect } from "@reckona/mreact-router";

export async function loader() {
  await new Promise((resolve) => setTimeout(resolve, ${Math.max(1, Math.floor(options.simulatedLoaderMs / 2))}));
  redirect("/", { status: 303 });
}

export default function Login() {
  return <main>login</main>;
}
`,
  );
  await writeFile(
    join(directory, "healthz", "page.tsx"),
    `export default function Healthz() {
  return <main>ok</main>;
}
`,
  );
}

async function writeSharedRuntimePackageFixtureApp(rootDir: string): Promise<void> {
  const appDir = join(rootDir, "app");
  const packageDir = join(rootDir, "node_modules", "lambda-db");
  const heavyFunctions = Array.from(
    { length: 4000 },
    (_, index) => `export function dbHelper${index}(left, right) { return left * ${index} + right; }`,
  ).join("\n");
  const registry = `export const registry = [${Array.from({ length: 4000 }, (_, index) => `dbHelper${index}`).join(", ")}];`;

  await mkdir(packageDir, { recursive: true });
  await mkdir(join(appDir, "users"), { recursive: true });
  await mkdir(join(appDir, "families"), { recursive: true });
  await writeFile(
    join(packageDir, "package.json"),
    JSON.stringify({ exports: "./index.js", name: "lambda-db", type: "module" }),
  );
  await writeFile(
    join(packageDir, "index.js"),
    `${heavyFunctions}
${registry}
export function queryTitle(name) {
  return "title:" + registry.length + ":" + name;
}
export function verifySession(token) {
  return registry.length > 0 && token === "ok";
}
`,
  );
  await writeFile(
    join(rootDir, "package.json"),
    JSON.stringify({ dependencies: { "lambda-db": "1.0.0" } }),
  );
  await writeFile(
    join(appDir, "middleware.ts"),
    `import { verifySession } from "lambda-db";

export const config = { matcher: "/:path*" };

export function middleware(request) {
  verifySession(request.headers.get("cookie") ?? "ok");
}
`,
  );

  const loaderPage = (name: string) => `import { queryTitle } from "lambda-db";

export function loader() {
  return { title: queryTitle("${name}") };
}

export default function Page(props) {
  return <main>{props.data.title}</main>;
}
`;

  await writeFile(join(appDir, "page.tsx"), loaderPage("root"));
  await writeFile(join(appDir, "users", "page.tsx"), loaderPage("users"));
  await writeFile(join(appDir, "families", "page.tsx"), loaderPage("families"));
}

async function invokeScenario(
  handler: ReturnType<typeof createAwsLambdaRequestHandler>,
  events: AppRouterLogEvent[],
  scenario: string,
  path: string,
  iteration: number,
): Promise<LambdaRouteLatencyRow> {
  const startIndex = events.length;
  const startedAt = performance.now();
  const result = await handler(lambdaEvent(path));
  const requestDurationMs = round(performance.now() - startedAt);
  await Promise.resolve();

  const scenarioEvents = events.slice(startIndex);
  const requestTiming = scenarioEvents.find((event) => event.type === "router:request:timing");
  const renderTiming = scenarioEvents.find((event) => event.type === "router:render:timing");

  if (requestTiming?.type !== "router:request:timing") {
    throw new Error(
      `Missing router:request:timing for ${scenario}: ${scenarioEvents.map(formatEventForMissingTiming).join(", ")}`,
    );
  }

  return {
    bodyBytes: Buffer.byteLength(result.body, "utf8"),
    iteration,
    path,
    renderPhases: renderTiming?.type === "router:render:timing" ? roundPhases(renderTiming.phases) : {},
    requestDurationMs,
    requestPhases: roundPhases(requestTiming.phases),
    scenario,
    status: result.statusCode,
  };
}

function lambdaEvent(path: string): AwsLambdaHttpEventV2 {
  return {
    headers: {
      host: "lambda.local",
      "x-forwarded-proto": "https",
    },
    rawPath: path,
    rawQueryString: "",
    requestContext: {
      http: {
        method: "GET",
      },
    },
    version: "2.0",
  };
}

async function invokeStreamingScenario(
  handler: ReturnType<typeof createAwsLambdaStreamingRequestHandler>,
  events: AppRouterLogEvent[],
  scenario: string,
  path: string,
  iteration: number,
): Promise<LambdaRouteLatencyRow> {
  const startIndex = events.length;
  const stream = createTestLambdaResponseStream();
  const startedAt = performance.now();
  await handler(lambdaEvent(path), stream, {});
  const requestDurationMs = round(performance.now() - startedAt);
  await Promise.resolve();

  const scenarioEvents = events.slice(startIndex);
  const requestTiming = scenarioEvents.find((event) => event.type === "router:request:timing");

  if (requestTiming?.type !== "router:request:timing") {
    throw new Error(
      `Missing router:request:timing for ${scenario}: ${scenarioEvents.map(formatEventForMissingTiming).join(", ")}`,
    );
  }

  return {
    bodyBytes: Buffer.concat(stream.chunks).byteLength,
    iteration,
    path,
    renderPhases: {},
    requestDurationMs,
    requestPhases: roundPhases(requestTiming.phases),
    scenario,
    status: stream.metadata?.statusCode ?? 0,
  };
}

interface TestLambdaResponseStream extends AwsLambdaStreamingResponseStream {
  chunks: Buffer[];
  ended: boolean;
  metadata?: AwsLambdaStreamingResponseMetadata | undefined;
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
  };
}

function installAwsLambdaStreamingMock(): void {
  (globalThis as { awslambda?: unknown }).awslambda = {
    HttpResponseStream: {
      from(
        stream: TestLambdaResponseStream,
        metadata: AwsLambdaStreamingResponseMetadata,
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

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function roundPhases(phases: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(phases).map(([name, value]) => [name, round(value)]));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatEventForMissingTiming(event: AppRouterLogEvent): string {
  if (event.type !== "router:request:error") {
    return event.type;
  }

  return `${event.type}:${JSON.stringify(event.error)}`;
}
