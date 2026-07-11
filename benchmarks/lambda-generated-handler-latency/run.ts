import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { createDatedResultsDir, writeJsonFile, writeTextFile } from "../shared/results.js";
import { formatLambdaGeneratedHandlerLatencyMarkdown } from "./report.js";
import type {
  LambdaGeneratedHandlerLatencyRow,
  LambdaGeneratedHandlerPreloadMode,
} from "./types.js";

const routeCount = readNumberEnv("MREACT_LAMBDA_GENERATED_HANDLER_ROUTES", 72);
const repeatCount = readNumberEnv("MREACT_LAMBDA_GENERATED_HANDLER_REPEATS", 5);
const targetRoot = process.env.MREACT_LAMBDA_BENCH_TARGET_ROOT ?? process.cwd();
const { buildApp, packageAwsLambdaArtifact } = (await import(
  pathToFileURL(join(targetRoot, "packages/router/dist/build.js")).href
)) as typeof import("../../packages/router/src/build.js");
const rootDir = await mkdtemp(join(tmpdir(), "mreact-lambda-generated-handler-"));
const appDir = join(rootDir, "app");
const outDir = join(rootDir, ".mreact");
const policies: LambdaGeneratedHandlerPreloadMode[] = ["middleware", "hot-route-requests", "all"];
const packageDirs = Object.fromEntries(
  policies.map((policy) => [policy, join(rootDir, `.lambda-${policy}`)]),
) as Record<LambdaGeneratedHandlerPreloadMode, string>;
const synthesizedStreamingPolicies: LambdaGeneratedHandlerPreloadMode[] = [];
const routes = ["/", ...Array.from({ length: routeCount }, (_, index) => `/route-${index}`)];
const hotRoutes = ["/", "/route-0"];

await writeFixtureApp(appDir, routeCount);
await buildApp({
  allowedSourceDirs: ["app"],
  outDir,
  projectRoot: rootDir,
  routesDir: "app",
  targets: ["aws-lambda"],
});
for (const policy of policies) {
  const packageDir = packageDirs[policy];
  await packageAwsLambdaArtifact({
    awsLambdaPreload: policy,
    ...(policy === "hot-route-requests" ? { awsLambdaPreloadRoutes: hotRoutes } : {}),
    fromDir: outDir,
    outDir: packageDir,
    skipRuntimeDependencyCheck: true,
  });
  if (await ensureStreamingBaselineEntry(packageDir)) synthesizedStreamingPolicies.push(policy);
  await linkLocalRouterPackage(packageDir);
}

const rows: LambdaGeneratedHandlerLatencyRow[] = [];

for (const path of ["/route-0", "/"]) {
  for (let iteration = 1; iteration <= repeatCount; iteration += 1) {
    for (const preload of policies) {
      for (const entry of ["buffered", "streaming"] as const) {
        const handlerFile =
          entry === "buffered" ? "mreact-handler.mjs" : "mreact-streaming-handler.mjs";
        await readFile(join(packageDirs[preload], handlerFile));
        rows.push(
          await invokeGeneratedHandlerScenario({
            entry,
            handlerFile,
            iteration,
            packageDir: packageDirs[preload],
            path,
            preload,
          }),
        );
      }
    }
  }
}

const env = await collectBenchmarkEnvironment(["@reckona/mreact-router"]);
const dir = await createDatedResultsDir();
const targetCommit = execFileSync("git", ["-C", targetRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const markdown = formatLambdaGeneratedHandlerLatencyMarkdown(env, rows, targetCommit);
const generatedHandlerSources: Record<string, string> = {};
const generatedHandlerSha256: Record<string, string> = {};
for (const policy of policies) {
  for (const [entry, handlerFile] of [
    ["buffered", "mreact-handler.mjs"],
    ["streaming", "mreact-streaming-handler.mjs"],
  ] as const) {
    try {
      const source = await readFile(join(packageDirs[policy], handlerFile), "utf8");
      generatedHandlerSources[`${policy}:${entry}`] = source;
      generatedHandlerSha256[`${policy}:${entry}`] = createHash("sha256")
        .update(source)
        .digest("hex");
    } catch {}
  }
}

await writeJsonFile(join(dir, "lambda-generated-handler-latency.summary.json"), {
  environment: env,
  buildMode: "production/aws-lambda",
  generatedHandlerSources,
  synthesizedStreamingPolicies,
  generatedHandlerSha256,
  repeatCount,
  routes,
  routeCount,
  hotRoutes,
  targetCommit,
  rows,
});
await writeTextFile(join(dir, "lambda-generated-handler-latency.md"), markdown);

console.log(markdown);

async function writeFixtureApp(directory: string, routes: number): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "..", "package.json"), JSON.stringify({ dependencies: {} }));
  await writeFile(
    join(directory, "middleware.ts"),
    `export const config = { matcher: "/admin/:path*" };

export function middleware() {}
`,
  );
  await writeFile(
    join(directory, "page.tsx"),
    `import { redirect } from "@reckona/mreact-router";

export function loader() {
  redirect("/login", { status: 303 });
}

export default function Page() {
  return <main>root</main>;
}
`,
  );

  for (let index = 0; index < routes; index += 1) {
    const routeDir = join(directory, `route-${index}`);
    await mkdir(routeDir, { recursive: true });
    await writeFile(
      join(routeDir, "page.tsx"),
      `export function loader() {
  return { title: "route-${index}" };
}

export default function Page({ data }) {
  return <main>{data.title}</main>;
}
`,
    );
  }
}

async function linkLocalRouterPackage(packageDir: string): Promise<void> {
  await mkdir(join(packageDir, "node_modules", "@reckona"), { recursive: true });
  await symlink(
    join(targetRoot, "packages", "router"),
    join(packageDir, "node_modules", "@reckona", "mreact-router"),
  );
}

async function ensureStreamingBaselineEntry(packageDir: string): Promise<boolean> {
  const streamingPath = join(packageDir, "mreact-streaming-handler.mjs");
  try {
    await readFile(streamingPath);
    return false;
  } catch (error) {
    if (!isNodeErrorCode(error, "ENOENT")) throw error;
  }

  const bufferedSource = await readFile(join(packageDir, "mreact-handler.mjs"), "utf8");
  const streamingSource = bufferedSource.replaceAll(
    "createPreloadedAwsLambdaRequestHandler",
    "createPreloadedAwsLambdaStreamingRequestHandler",
  );
  if (streamingSource === bufferedSource) {
    throw new Error("Cannot synthesize the baseline streaming handler from generated source.");
  }
  await writeFile(streamingPath, streamingSource);
  return true;
}

async function invokeGeneratedHandlerScenario(options: {
  entry: "buffered" | "streaming";
  handlerFile: string;
  iteration: number;
  packageDir: string;
  path: string;
  preload: LambdaGeneratedHandlerPreloadMode;
}): Promise<LambdaGeneratedHandlerLatencyRow> {
  const script = [
    `let responseMetadata;`,
    `globalThis.awslambda = { streamifyResponse: (handler) => handler, HttpResponseStream: { from: (stream, metadata) => { responseMetadata = metadata; return stream; } } };`,
    `const beforeImport = performance.now();`,
    `const mod = await import(${JSON.stringify(pathToFileURL(join(options.packageDir, options.handlerFile)).href)});`,
    `const afterImport = performance.now();`,
    `const event = {`,
    `  headers: { host: "lambda.test", "x-forwarded-proto": "https" },`,
    `  rawPath: ${JSON.stringify(options.path)},`,
    `  rawQueryString: "",`,
    `  requestContext: { http: { method: "GET" } },`,
    `  version: "2.0",`,
    `};`,
    `const makeStream = () => ({ write: () => true, end: () => {}, once: (_event, callback) => callback() });`,
    `const beforeFirst = performance.now();`,
    `responseMetadata = undefined;`,
    `const first = ${options.entry === "streaming" ? "await mod.handler(event, makeStream(), {})" : "await mod.handler(event)"};`,
    `const afterFirst = performance.now();`,
    `const beforeWarm = performance.now();`,
    `responseMetadata = undefined;`,
    `${options.entry === "streaming" ? "await mod.handler(event, makeStream(), {})" : "await mod.handler(event)"};`,
    `const afterWarm = performance.now();`,
    `console.log(JSON.stringify({`,
    `  importMs: afterImport - beforeImport,`,
    `  firstMs: afterFirst - beforeFirst,`,
    `  status: ${options.entry === "streaming" ? "responseMetadata.statusCode" : "first.statusCode"},`,
    `  warmMs: afterWarm - beforeWarm,`,
    `}));`,
  ].join("\n");
  const result = await runNodeModuleScript(script, options.packageDir);

  return {
    coldTotalMs: round(result.importMs + result.firstMs),
    entry: options.entry,
    firstMs: round(result.firstMs),
    importMs: round(result.importMs),
    iteration: options.iteration,
    path: options.path,
    preload: options.preload,
    scenario: options.path === "/" ? "generated-root-redirect" : "generated-first-route",
    status: result.status,
    warmMs: round(result.warmMs),
  };
}

async function runNodeModuleScript(
  script: string,
  cwd: string,
): Promise<{ firstMs: number; importMs: number; status: number; warmMs: number }> {
  const child = spawn(process.execPath, ["--input-type=module", "--eval", script], {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: "production",
      NO_COLOR: "1",
    },
  });
  const output: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));

  const exitCode = await new Promise<number | null>((resolve) => {
    child.once("exit", (code) => resolve(code));
  });

  if (exitCode !== 0) {
    throw new Error(`Node script failed with exit code ${exitCode}.\n${output.join("")}`);
  }

  return JSON.parse(output.join("").trim().split("\n").at(-1) ?? "{}") as {
    firstMs: number;
    importMs: number;
    status: number;
    warmMs: number;
  };
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
