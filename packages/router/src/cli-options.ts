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
  log?: CliRequestLogMode | undefined;
  out?: string | undefined;
  routeArg?: string | undefined;
  target?: CliBuildTarget | undefined;
}

export function parseCliArguments(argv: readonly string[]): ParsedCliArguments {
  const first = argv[0];
  const command = first === undefined || first.startsWith("-") ? "dev" : first;
  const parsed: ParsedCliArguments = { command };
  const startIndex = command === first ? 1 : 0;

  for (let index = startIndex; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === undefined) {
      continue;
    }

    if (value === "--log") {
      parsed.log = parseCliRequestLogMode(readOptionValue(argv, index, "log"));
      index += 1;
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
