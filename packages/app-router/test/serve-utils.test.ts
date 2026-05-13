import { describe, expect, test } from "vitest";
import { resolveRequestHost } from "../src/serve.js";

describe("app-router serve utils", () => {
  test("resolveRequestHost returns the fallback when there is no Host header", () => {
    expect(
      resolveRequestHost({ fallbackHost: "fallback.host", rawHost: undefined }),
    ).toBe("fallback.host");
    expect(
      resolveRequestHost({ fallbackHost: "fallback.host", rawHost: "" }),
    ).toBe("fallback.host");
  });

  test("resolveRequestHost echoes the Host header unchanged when no allow-list is configured", () => {
    expect(
      resolveRequestHost({
        fallbackHost: "fallback.host",
        rawHost: "attacker.test",
      }),
    ).toBe("attacker.test");
  });

  test("resolveRequestHost falls back when the Host header is not in the allow-list (Issue 068)", () => {
    expect(
      resolveRequestHost({
        allowedHosts: ["app.test"],
        fallbackHost: "fallback.host",
        rawHost: "attacker.test",
      }),
    ).toBe("fallback.host");
  });

  test("resolveRequestHost echoes the Host header when it matches the allow-list", () => {
    expect(
      resolveRequestHost({
        allowedHosts: ["app.test", "api.test"],
        fallbackHost: "fallback.host",
        rawHost: "api.test",
      }),
    ).toBe("api.test");
  });
});
