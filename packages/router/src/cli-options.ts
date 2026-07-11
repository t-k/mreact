import type { AppRouterLogger, AppRouterLogEvent } from "./logger.js";
import {
  appRouterBuildTargetMetadata,
  type AppRouterBuildTarget,
  type AppRouterClientSourceMapMode,
} from "./config.js";
import type { RequestHostPolicy } from "./serve.js";
import type { AwsLambdaGeneratedHandlerPreloadMode } from "./build.js";

export type CliRequestLogMode = "requests";
export type CliBuildTarget = AppRouterBuildTarget | "all";

export interface ParsedCliArguments {
  awsLambdaPreload?: AwsLambdaGeneratedHandlerPreloadMode | undefined;
  clientSourceMaps?: AppRouterClientSourceMapMode | undefined;
  command: string;
  allowedHosts?: readonly string[] | undefined;
  from?: string | undefined;
  handler?: string | undefined;
  help?: boolean | undefined;
  host?: string | undefined;
  hostPolicy?: RequestHostPolicy | undefined;
  log?: CliRequestLogMode | undefined;
  out?: string | undefined;
  port?: number | undefined;
  routeArg?: string | undefined;
  skipRuntimeDependencyCheck?: boolean | undefined;
  target?: CliBuildTarget | undefined;
}

export function parseCliArguments(argv: readonly string[]): ParsedCliArguments {
  const first = argv[0];
  const rootHelp = first === "--help" || first === "-h";
  const command = rootHelp ? "help" : first === undefined || first.startsWith("-") ? "dev" : first;
  const parsed: ParsedCliArguments = rootHelp ? { command, help: true } : { command };
  const startIndex = rootHelp || command === first ? 1 : 0;

  for (let index = startIndex; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === undefined) {
      continue;
    }

    if (value === "--help" || value === "-h") {
      parsed.help = true;
      continue;
    }

    if (value === "--log") {
      parsed.log = parseCliRequestLogMode(readOptionValue(argv, index, "log"));
      index += 1;
      continue;
    }

    if (value === "--port") {
      parsed.port = parseCliPort(readOptionValue(argv, index, "port"));
      index += 1;
      continue;
    }

    if (value.startsWith("--port=")) {
      parsed.port = parseCliPort(value.slice("--port=".length));
      continue;
    }

    if (value === "--host") {
      parsed.host = readOptionValue(argv, index, "host");
      index += 1;
      continue;
    }

    if (value.startsWith("--host=")) {
      parsed.host = value.slice("--host=".length);
      continue;
    }

    if (value === "--host-policy") {
      parsed.hostPolicy = parseCliHostPolicy(readOptionValue(argv, index, "host-policy"));
      index += 1;
      continue;
    }

    if (value.startsWith("--host-policy=")) {
      parsed.hostPolicy = parseCliHostPolicy(value.slice("--host-policy=".length));
      continue;
    }

    if (value === "--allowed-hosts") {
      parsed.allowedHosts = parseCliAllowedHosts(readOptionValue(argv, index, "allowed-hosts"));
      index += 1;
      continue;
    }

    if (value.startsWith("--allowed-hosts=")) {
      parsed.allowedHosts = parseCliAllowedHosts(value.slice("--allowed-hosts=".length));
      continue;
    }

    if (value === "--from") {
      parsed.from = readOptionValue(argv, index, "from");
      index += 1;
      continue;
    }

    if (value.startsWith("--from=")) {
      parsed.from = value.slice("--from=".length);
      continue;
    }

    if (value === "--out") {
      parsed.out = readOptionValue(argv, index, "out");
      index += 1;
      continue;
    }

    if (value.startsWith("--out=")) {
      parsed.out = value.slice("--out=".length);
      continue;
    }

    if (value === "--skip-runtime-dependency-check") {
      parsed.skipRuntimeDependencyCheck = true;
      continue;
    }

    if (value === "--handler") {
      parsed.handler = readOptionValue(argv, index, "handler");
      index += 1;
      continue;
    }

    if (value.startsWith("--handler=")) {
      parsed.handler = value.slice("--handler=".length);
      continue;
    }

    if (value.startsWith("--log=")) {
      parsed.log = parseCliRequestLogMode(value.slice("--log=".length));
      continue;
    }

    if (value === "--target") {
      parsed.target = parseCliBuildTarget(readOptionValue(argv, index, "target"));
      index += 1;
      continue;
    }

    if (value.startsWith("--target=")) {
      parsed.target = parseCliBuildTarget(value.slice("--target=".length));
      continue;
    }

    if (value === "--client-source-maps") {
      parsed.clientSourceMaps = parseCliClientSourceMapMode(
        readOptionValue(argv, index, "client-source-maps"),
      );
      index += 1;
      continue;
    }

    if (value === "--aws-lambda-preload") {
      parsed.awsLambdaPreload = parseCliAwsLambdaPreloadMode(
        readOptionValue(argv, index, "aws-lambda-preload"),
      );
      index += 1;
      continue;
    }

    if (value.startsWith("--aws-lambda-preload=")) {
      parsed.awsLambdaPreload = parseCliAwsLambdaPreloadMode(
        value.slice("--aws-lambda-preload=".length),
      );
      continue;
    }

    if (value.startsWith("--client-source-maps=")) {
      parsed.clientSourceMaps = parseCliClientSourceMapMode(
        value.slice("--client-source-maps=".length),
      );
      continue;
    }

    if (value.startsWith("-")) {
      throw new Error(`Unknown option ${value}`);
    }

    if (parsed.routeArg !== undefined) {
      throw new Error(`Unexpected argument ${value}`);
    }

    parsed.routeArg = value;
  }

  return parsed;
}

export function formatCliHelp(command?: string | undefined): string {
  const defaultTargetLabel = formatBuildTargetDisplayList(
    appRouterBuildTargetMetadata.defaultTargets,
  );
  const allTargetValues = formatBuildTargetValueList(appRouterBuildTargetMetadata.allTargets);

  if (command === "build") {
    return [
      "Usage: mreact-router build [appDir] [options]",
      "",
      "Build an mreact app router project.",
      "",
      "Options:",
      "  --target=node|cloudflare|aws-lambda|all",
      `      Select build artifacts. Defaults to ${defaultTargetLabel.toLowerCase()}. all selects ${allTargetValues}. aws-lambda writes .mreact/aws-lambda/mreact-handler.mjs and .mreact/server/import-policy.json.`,
      "  --client-source-maps=none|hidden",
      "      Control production client source map output.",
      "  --aws-lambda-preload=middleware|hot-route-requests|all|none",
      "      Select generated Lambda initialization preload. Defaults to middleware.",
      "  -h, --help",
      "      Show this help message.",
      "",
      "Examples:",
      "  mreact-router build --target=node",
      "  mreact-router build --target=cloudflare",
      "  mreact-router build --target=aws-lambda",
      "  mreact-router build --target=all",
    ].join("\n");
  }

  if (command === "package") {
    return [
      "Usage: mreact-router package <target> [options]",
      "",
      "Package generated build output into a deployable artifact directory.",
      "",
      "Targets:",
      "  aws-lambda        Minimal AWS Lambda asset directory.",
      "  cloudflare-pages  Cloudflare Pages advanced mode output with _worker.js.",
      "",
      "Options:",
      "  --from <dir>      Build output directory. Default: .mreact",
      "  --out <dir>       Output directory. Defaults to .lambda for aws-lambda and .mreact/pages for cloudflare-pages.",
      "  --skip-runtime-dependency-check",
      "      For aws-lambda only, skip the production node_modules check when a later deploy step installs dependencies into the package directory.",
      "  --handler <entry>",
      "      For aws-lambda only, bundle a custom handler entry into mreact-handler.mjs. App-local extensionless TypeScript imports are bundled; package imports stay external.",
      "  --aws-lambda-preload=middleware|hot-route-requests|all|none",
      "      Select generated Lambda initialization preload. Defaults to middleware.",
      "  -h, --help        Show this help message.",
      "",
      "Examples:",
      "  mreact-router package aws-lambda --from .mreact --out .lambda",
      "  mreact-router package cloudflare-pages --from .mreact --out .mreact/pages",
    ].join("\n");
  }

  if (command === "start") {
    return [
      "Usage: mreact-router start [outDir] [options]",
      "",
      "Serve built mreact app router output with the Node adapter.",
      "",
      "Options:",
      "  --host <host>  Bind address. Default: 127.0.0.1. Use 0.0.0.0 inside containers behind explicit port publishing or a reverse proxy.",
      "  --host-policy=strict|trusted-proxy",
      "      Control Host header trust for request origin reconstruction.",
      "  --allowed-hosts <host[,host...]>",
      "      Exact Host header allow-list for public deployments.",
      "  --log=requests  Print request summaries.",
      "  -h, --help      Show this help message.",
      "",
      "Environment:",
      "  HOST            Bind address when --host is not set.",
      "  MREACT_ROUTER_HOST_POLICY",
      "                  Host header trust policy when --host-policy is not set.",
      "  MREACT_ROUTER_ALLOWED_HOSTS",
      "                  Comma-separated Host header allow-list when --allowed-hosts is not set.",
      "  PORT            TCP port. Default: 3001.",
    ].join("\n");
  }

  if (command === "dev") {
    return [
      "Usage: mreact-router dev [appDir] [options]",
      "",
      "Start the mreact app router development server.",
      "",
      "Options:",
      "  --host <host>  Bind address. Default: 127.0.0.1. Use 0.0.0.0 for LAN or device testing.",
      "  --port <port>  TCP port. Overrides PORT and vite.config.ts server.port.",
      "  --log=requests  Print request summaries.",
      "  -h, --help      Show this help message.",
      "",
      "Environment:",
      "  HOST            Bind address when --host is not set.",
      "  PORT            TCP port when --port is not set.",
    ].join("\n");
  }

  return [
    "Usage: mreact-router <command> [options]",
    "",
    "Commands:",
    "  dev [appDir]                              Start the development server.",
    `  build [appDir]                            Build ${defaultTargetLabel} artifacts by default.`,
    "  build --target=aws-lambda                 Build Lambda artifacts including generated handler and import policy.",
    "  start [outDir]                            Serve built Node output.",
    "  package aws-lambda --from .mreact --out .lambda",
    "                                           Package a minimal AWS Lambda asset directory.",
    "  package aws-lambda --handler lambda/mreact-handler.ts",
    "                                           Bundle a custom Lambda handler with app-local server imports.",
    "  package cloudflare-pages --from .mreact --out .mreact/pages",
    "                                           Package Cloudflare Pages advanced mode output.",
    "  help [command]                            Show help.",
    "",
    "Options:",
    "  -h, --help                                Show this help message.",
    "  --log=requests                            Print request summaries for dev/start.",
    "",
    "Examples:",
    "  mreact-router build --target=cloudflare",
    "  mreact-router build --target=aws-lambda",
    "  mreact-router build --target=all",
    "  mreact-router package aws-lambda --from .mreact --out .lambda",
    "  mreact-router build --help",
  ].join("\n");
}

export function buildTargetsFromCliTarget(
  target: CliBuildTarget | undefined,
): readonly AppRouterBuildTarget[] | undefined {
  if (target === undefined) {
    return undefined;
  }

  return target === "all" ? appRouterBuildTargetMetadata.allTargets : [target];
}

function formatBuildTargetDisplayList(targets: readonly AppRouterBuildTarget[]): string {
  return targets.map(formatBuildTargetDisplayName).join(", ");
}

function formatBuildTargetDisplayName(target: AppRouterBuildTarget): string {
  if (target === "aws-lambda") return "AWS Lambda";
  return target[0]?.toUpperCase() + target.slice(1);
}

function formatBuildTargetValueList(targets: readonly AppRouterBuildTarget[]): string {
  if (targets.length < 2) return targets[0] ?? "";
  return `${targets.slice(0, -1).join(", ")}, and ${targets.at(-1)}`;
}

export function resolveCliRequestLogMode(
  flagValue: CliRequestLogMode | undefined,
  env: { MREACT_ROUTER_LOG?: string | undefined },
): CliRequestLogMode | undefined {
  if (flagValue !== undefined) {
    return flagValue;
  }

  const envValue = env.MREACT_ROUTER_LOG;
  if (envValue === undefined || envValue === "") {
    return undefined;
  }

  return parseCliRequestLogMode(envValue);
}

export function resolveCliHost(
  flagValue: string | undefined,
  env: { HOST?: string | undefined },
): string {
  if (flagValue !== undefined && flagValue !== "") {
    return flagValue;
  }

  const envValue = env.HOST;
  return envValue === undefined || envValue === "" ? "127.0.0.1" : envValue;
}

export function resolveCliDevPort(
  flagValue: number | undefined,
  env: { PORT?: string | undefined },
  viteConfigPort: number | undefined,
): number | undefined {
  if (flagValue !== undefined) {
    return flagValue;
  }

  const envValue = env.PORT;
  return envValue === undefined || envValue === "" ? viteConfigPort : parseCliPort(envValue);
}

export function resolveCliHostPolicy(
  flagValue: RequestHostPolicy | undefined,
  env: { MREACT_ROUTER_HOST_POLICY?: string | undefined },
): RequestHostPolicy | undefined {
  if (flagValue !== undefined) {
    return flagValue;
  }

  const envValue = env.MREACT_ROUTER_HOST_POLICY;
  return envValue === undefined || envValue === "" ? undefined : parseCliHostPolicy(envValue);
}

export function resolveCliAllowedHosts(
  flagValue: readonly string[] | undefined,
  env: { MREACT_ROUTER_ALLOWED_HOSTS?: string | undefined },
): readonly string[] | undefined {
  if (flagValue !== undefined) {
    return flagValue;
  }

  const envValue = env.MREACT_ROUTER_ALLOWED_HOSTS;
  return envValue === undefined || envValue === "" ? undefined : parseCliAllowedHosts(envValue);
}

export function createCliRequestLogger(): AppRouterLogger {
  return {
    error(event) {
      if (event.type === "router:request:error") {
        console.error(formatCliRequestLogEvent(event));
      }
    },
    info(event) {
      if (event.type === "router:request:end") {
        console.log(formatCliRequestLogEvent(event));
      }
    },
  };
}

function parseCliRequestLogMode(value: string): CliRequestLogMode {
  if (value === "requests") {
    return value;
  }

  throw new Error(`Unsupported log mode ${JSON.stringify(value)}. Expected "requests".`);
}

function parseCliPort(value: string): number {
  const port = Number(value);

  if (Number.isInteger(port) && port >= 0 && port <= 65535) {
    return port;
  }

  throw new Error(`Unsupported port ${JSON.stringify(value)}. Expected an integer from 0 to 65535.`);
}

function parseCliHostPolicy(value: string): RequestHostPolicy {
  if (value === "strict" || value === "trusted-proxy") {
    return value;
  }

  throw new Error(
    `Unsupported host policy ${JSON.stringify(value)}. Expected "strict" or "trusted-proxy".`,
  );
}

function parseCliAllowedHosts(value: string): readonly string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function parseCliBuildTarget(value: string): CliBuildTarget {
  if (value === "node" || value === "cloudflare" || value === "aws-lambda" || value === "all") {
    return value;
  }

  throw new Error(
    `Unsupported build target ${JSON.stringify(value)}. Expected "node", "cloudflare", "aws-lambda", or "all".`,
  );
}

function parseCliClientSourceMapMode(value: string): AppRouterClientSourceMapMode {
  if (value === "none" || value === "hidden" || value === "linked") {
    return value;
  }

  throw new Error(
    `Unsupported client source map mode ${JSON.stringify(value)} for --client-source-maps. Expected "none", "hidden", or "linked".`,
  );
}

function parseCliAwsLambdaPreloadMode(value: string): AwsLambdaGeneratedHandlerPreloadMode {
  if (
    value === "all" ||
    value === "hot-route-requests" ||
    value === "middleware" ||
    value === "none"
  ) {
    return value;
  }

  throw new Error(
    `Unsupported aws-lambda-preload ${JSON.stringify(value)}. Expected "middleware", "hot-route-requests", "all", or "none".`,
  );
}

function readOptionValue(values: readonly string[], index: number, name: string): string {
  const value = values[index + 1];

  if (value === undefined || value.startsWith("-")) {
    throw new Error(`Missing value for --${name}`);
  }

  return value;
}

function formatCliRequestLogEvent(event: AppRouterLogEvent): string {
  if (event.type === "router:request:error") {
    return `[mreact] ${event.method} ${event.path} error ${event.durationMs}ms ${event.runtime} ${event.error.name}: ${event.error.message}`;
  }

  if (event.type === "router:request:end") {
    return `[mreact] ${event.method} ${event.path} ${event.status} ${event.durationMs}ms ${event.runtime}`;
  }

  if (event.type === "router:request:timing") {
    return `[mreact] ${event.method} ${event.path} ${event.status} ${event.durationMs}ms ${event.runtime}`;
  }

  if (event.type === "router:render:timing") {
    return `[mreact] ${event.method} ${event.path} ${event.status} render timing`;
  }

  if (event.type === "router:csp:inline-nonce-warning") {
    return `[mreact] ${event.path} CSP ${event.directive} will block inline <${event.tag}> without a matching nonce`;
  }

  return `[mreact] ${event.method} ${event.path} ${event.runtime}`;
}
