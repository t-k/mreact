import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../../packages/router/src/build.js";
import {
  createAwsLambdaRequestHandler,
  type AwsLambdaHttpEventV2,
} from "../../packages/router/src/adapters/aws-lambda.js";
import type { AppRouterLogEvent, AppRouterLogger } from "../../packages/router/src/logger.js";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { createDatedResultsDir, writeJsonFile, writeTextFile } from "../shared/results.js";
import { formatLambdaRouteLatencyMarkdown } from "./report.js";
import type { LambdaRouteLatencyRow } from "./types.js";

const simulatedLoaderMs = readNumberEnv("MREACT_LAMBDA_BENCH_LOADER_MS", 25);
const simulatedMiddlewareMs = readNumberEnv("MREACT_LAMBDA_BENCH_MIDDLEWARE_MS", 10);
const repeatCount = readNumberEnv("MREACT_LAMBDA_BENCH_REPEATS", 3);
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
};
const handler = createAwsLambdaRequestHandler({
  logger,
  outDir,
  timings: true,
});

const rows: LambdaRouteLatencyRow[] = [];

rows.push(await invokeScenario(handler, events, "cold-healthz", "/healthz", 1));
rows.push(await invokeScenario(handler, events, "first-root-redirect", "/", 1));

for (let index = 1; index <= repeatCount; index += 1) {
  rows.push(await invokeScenario(handler, events, "warm-root-redirect", "/", index));
}

rows.push(await invokeScenario(handler, events, "first-login", "/login", 1));

const env = await collectBenchmarkEnvironment(["@reckona/mreact-router"]);
const dir = await createDatedResultsDir();
const markdown = formatLambdaRouteLatencyMarkdown(env, rows);

await writeJsonFile(join(dir, "lambda-route-latency.summary.json"), rows);
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
    throw new Error(`Missing router:request:timing for ${scenario}`);
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
