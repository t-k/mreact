import { describe, expect, test, vi } from "vitest";
import {
  createCliRequestLogger,
  parseCliArguments,
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
  });

  test("resolves MREACT_ROUTER_LOG=requests as the CLI request log mode", () => {
    expect(resolveCliRequestLogMode(undefined, { MREACT_ROUTER_LOG: "requests" })).toBe(
      "requests",
    );
    expect(resolveCliRequestLogMode("requests", { MREACT_ROUTER_LOG: "" })).toBe("requests");
    expect(resolveCliRequestLogMode(undefined, {})).toBeUndefined();
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
