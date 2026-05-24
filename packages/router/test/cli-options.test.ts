import { describe, expect, test, vi } from "vitest";
import {
  buildTargetsFromCliTarget,
  createCliRequestLogger,
  formatCliHelp,
  parseCliArguments,
  resolveCliAllowedHosts,
  resolveCliDevPort,
  resolveCliHost,
  resolveCliHostPolicy,
  resolveCliRequestLogMode,
} from "../src/cli-options.js";

describe("router CLI options", () => {
  test("parses request logging flags without treating them as route arguments", () => {
    expect(parseCliArguments(["dev", "--log=requests"])).toEqual({
      command: "dev",
      log: "requests",
      routeArg: undefined,
    });
    expect(parseCliArguments(["start", ".mreact", "--log", "requests"])).toEqual({
      command: "start",
      log: "requests",
      routeArg: ".mreact",
    });
  });

  test("parses dev port flags without treating them as route arguments", () => {
    expect(parseCliArguments(["dev", "--port", "15174"])).toEqual({
      command: "dev",
      port: 15174,
      routeArg: undefined,
    });
    expect(parseCliArguments(["dev", "src/app", "--port=15175"])).toEqual({
      command: "dev",
      port: 15175,
      routeArg: "src/app",
    });
    expect(() => parseCliArguments(["dev", "--port", "abc"])).toThrow(/port/);
  });

  test("parses start host binding flags without treating them as route arguments", () => {
    expect(parseCliArguments(["start", ".mreact", "--host", "0.0.0.0"])).toEqual({
      command: "start",
      host: "0.0.0.0",
      routeArg: ".mreact",
    });
    expect(parseCliArguments(["start", "--host=0.0.0.0"])).toEqual({
      command: "start",
      host: "0.0.0.0",
      routeArg: undefined,
    });
  });

  test("parses start Host header trust flags", () => {
    expect(
      parseCliArguments([
        "start",
        ".mreact",
        "--host-policy",
        "strict",
        "--allowed-hosts",
        "app.example.com,www.example.com",
      ]),
    ).toEqual({
      allowedHosts: ["app.example.com", "www.example.com"],
      command: "start",
      hostPolicy: "strict",
      routeArg: ".mreact",
    });
    expect(
      parseCliArguments([
        "start",
        "--host-policy=trusted-proxy",
        "--allowed-hosts=app.example.com",
      ]),
    ).toEqual({
      allowedHosts: ["app.example.com"],
      command: "start",
      hostPolicy: "trusted-proxy",
      routeArg: undefined,
    });
  });

  test("parses build target flags", () => {
    expect(parseCliArguments(["build", "--target=node"])).toEqual({
      command: "build",
      target: "node",
      routeArg: undefined,
    });
    expect(parseCliArguments(["build", "--target", "cloudflare"])).toEqual({
      command: "build",
      target: "cloudflare",
      routeArg: undefined,
    });
    expect(parseCliArguments(["build", "--target=aws-lambda"])).toEqual({
      command: "build",
      target: "aws-lambda",
      routeArg: undefined,
    });
    expect(buildTargetsFromCliTarget("aws-lambda")).toEqual(["aws-lambda"]);
  });

  test("parses help entrypoints", () => {
    expect(parseCliArguments(["--help"])).toEqual({ command: "help", help: true });
    expect(parseCliArguments(["help"])).toEqual({ command: "help" });
    expect(parseCliArguments(["help", "build"])).toEqual({ command: "help", routeArg: "build" });
    expect(parseCliArguments(["build", "--help"])).toEqual({ command: "build", help: true });
  });

  test("formats help text with build and Lambda options", () => {
    const help = formatCliHelp();
    const buildHelp = formatCliHelp("build");

    expect(help).toContain("mreact-router build --target=aws-lambda");
    expect(help).toContain("mreact-router package aws-lambda --from .mreact --out .lambda");
    expect(help).toContain("package cloudflare-pages --from .mreact --out .mreact/pages");
    expect(buildHelp).toContain("--target=node|cloudflare|aws-lambda|all");
    expect(buildHelp).toContain(".mreact/aws-lambda/mreact-handler.mjs");

    const startHelp = formatCliHelp("start");
    expect(startHelp).toContain("--host <host>");
    expect(startHelp).toContain("--host-policy");
    expect(startHelp).toContain("--allowed-hosts");
    expect(startHelp).toContain("127.0.0.1");
    expect(startHelp).toContain("0.0.0.0");

    const devHelp = formatCliHelp("dev");
    expect(devHelp).toContain("--port <port>");
    expect(devHelp).toContain("PORT");
  });

  test("parses package artifact options", () => {
    expect(parseCliArguments(["package", "aws-lambda", "--from", ".mreact", "--out=.lambda"])).toEqual({
      command: "package",
      from: ".mreact",
      out: ".lambda",
      routeArg: "aws-lambda",
    });
    expect(parseCliArguments(["package", "cloudflare-pages", "--from=.mreact", "--out", ".mreact/pages"])).toEqual({
      command: "package",
      from: ".mreact",
      out: ".mreact/pages",
      routeArg: "cloudflare-pages",
    });
  });

  test("parses production client source map flags", () => {
    expect(parseCliArguments(["build", "--client-source-maps=hidden"])).toEqual({
      command: "build",
      clientSourceMaps: "hidden",
      routeArg: undefined,
    });
    expect(parseCliArguments(["build", "--client-source-maps", "none"])).toEqual({
      command: "build",
      clientSourceMaps: "none",
      routeArg: undefined,
    });
    expect(() => parseCliArguments(["build", "--client-source-maps=inline"])).toThrow(
      /client-source-maps/,
    );
  });

  test("resolves MREACT_ROUTER_LOG=requests as the CLI request log mode", () => {
    expect(resolveCliRequestLogMode(undefined, { MREACT_ROUTER_LOG: "requests" })).toBe(
      "requests",
    );
    expect(resolveCliRequestLogMode("requests", { MREACT_ROUTER_LOG: "" })).toBe("requests");
    expect(resolveCliRequestLogMode(undefined, {})).toBeUndefined();
  });

  test("resolves explicit host, HOST env, and the safe default host", () => {
    expect(resolveCliHost("0.0.0.0", { HOST: "127.0.0.1" })).toBe("0.0.0.0");
    expect(resolveCliHost(undefined, { HOST: "0.0.0.0" })).toBe("0.0.0.0");
    expect(resolveCliHost(undefined, {})).toBe("127.0.0.1");
  });

  test("resolves dev port from flag, PORT env, and vite config", () => {
    expect(resolveCliDevPort(15174, { PORT: "15173" }, 3000)).toBe(15174);
    expect(resolveCliDevPort(undefined, { PORT: "15173" }, 3000)).toBe(15173);
    expect(resolveCliDevPort(undefined, {}, 3000)).toBe(3000);
    expect(resolveCliDevPort(undefined, {}, undefined)).toBeUndefined();
  });

  test("resolves start Host header trust from flags and env", () => {
    expect(resolveCliHostPolicy("strict", { MREACT_ROUTER_HOST_POLICY: "trusted-proxy" })).toBe(
      "strict",
    );
    expect(resolveCliHostPolicy(undefined, { MREACT_ROUTER_HOST_POLICY: "strict" })).toBe(
      "strict",
    );
    expect(resolveCliAllowedHosts(["app.example.com"], { MREACT_ROUTER_ALLOWED_HOSTS: "env.test" }))
      .toEqual(["app.example.com"]);
    expect(resolveCliAllowedHosts(undefined, { MREACT_ROUTER_ALLOWED_HOSTS: "app.test, api.test" }))
      .toEqual(["app.test", "api.test"]);
    expect(resolveCliAllowedHosts(undefined, {})).toBeUndefined();
  });

  test("prints compact non-sensitive request summaries", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createCliRequestLogger();

    logger.info?.({
      durationMs: 12.345,
      method: "GET",
      path: "/items",
      runtime: "node",
      status: 200,
      type: "router:request:end",
    });
    logger.error?.({
      durationMs: 7,
      error: {
        message: "boom",
        name: "Error",
      },
      method: "POST",
      path: "/api/items",
      runtime: "node",
      type: "router:request:error",
    });

    expect(log).toHaveBeenCalledWith("[mreact] GET /items 200 12.345ms node");
    expect(error).toHaveBeenCalledWith("[mreact] POST /api/items error 7ms node Error: boom");

    log.mockRestore();
    error.mockRestore();
  });
});
