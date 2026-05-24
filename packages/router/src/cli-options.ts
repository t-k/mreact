import type { AppRouterLogger, AppRouterLogEvent } from "./logger.js";
import type {
  AppRouterBuildTarget,
  AppRouterClientSourceMapMode,
} from "./config.js";

export type CliRequestLogMode = "requests";
export type CliBuildTarget = AppRouterBuildTarget | "all";

export interface ParsedCliArguments {
  clientSourceMaps?: AppRouterClientSourceMapMode | undefined;
  command: string;
  from?: string | undefined;
  help?: boolean | undefined;
  host?: string | undefined;
  log?: CliRequestLogMode | undefined;
  out?: string | undefined;
  routeArg?: string | undefined;
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

    if (value === "--host") {
      parsed.host = readOptionValue(argv, index, "host");
      index += 1;
      continue;
    }

    if (value.startsWith("--host=")) {
      parsed.host = value.slice("--host=".length);
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
  if (command === "build") {
    return [
      "Usage: mreact-router build [appDir] [options]",
      "",
      "Build an mreact app router project.",
      "",
      "Options:",
      "  --target=node|cloudflare|aws-lambda|all",
      "      Select build artifacts. aws-lambda writes .mreact/aws-lambda/mreact-handler.mjs and .mreact/server/import-policy.json.",
      "  --client-source-maps=none|hidden",
      "      Control production client source map output.",
      "  -h, --help",
      "      Show this help message.",
      "",
      "Examples:",
      "  mreact-router build --target=node",
      "  mreact-router build --target=cloudflare",
      "  mreact-router build --target=aws-lambda",
    ].join("\n");
  }

  if (command === "package") {
    return [
      "Usage: mreact-router package aws-lambda [options]",
      "",
      "Package generated build output into a minimal AWS Lambda asset directory.",
      "",
      "Options:",
      "  --from <dir>    Build output directory. Default: .mreact",
      "  --out <dir>     Lambda asset output directory. Default: .lambda",
      "  -h, --help      Show this help message.",
      "",
      "Example:",
      "  mreact-router package aws-lambda --from .mreact --out .lambda",
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
      "  --log=requests  Print request summaries.",
      "  -h, --help      Show this help message.",
      "",
      "Environment:",
      "  HOST            Bind address when --host is not set.",
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
      "  --log=requests  Print request summaries.",
      "  -h, --help      Show this help message.",
    ].join("\n");
  }

  return [
    "Usage: mreact-router <command> [options]",
    "",
    "Commands:",
    "  dev [appDir]                              Start the development server.",
    "  build [appDir]                            Build Node and Cloudflare artifacts by default.",
    "  build --target=aws-lambda                 Build Lambda artifacts including generated handler and import policy.",
    "  start [outDir]                            Serve built Node output.",
    "  package aws-lambda --from .mreact --out .lambda",
    "                                           Package a minimal AWS Lambda asset directory.",
    "  help [command]                            Show help.",
    "",
    "Options:",
    "  -h, --help                                Show this help message.",
    "  --log=requests                            Print request summaries for dev/start.",
    "",
    "Examples:",
    "  mreact-router build --target=cloudflare",
    "  mreact-router build --target=aws-lambda",
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

  return target === "all" ? ["node", "cloudflare", "aws-lambda"] : [target];
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

  return `[mreact] ${event.method} ${event.path} ${event.runtime}`;
}
