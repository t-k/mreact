import { afterEach, describe, expect, test, vi } from "vitest";

const originalNodeEnv = process.env.NODE_ENV;
const originalActionSecret = process.env.MREACT_SERVER_ACTION_SECRET;

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
  if (originalActionSecret === undefined) {
    delete process.env.MREACT_SERVER_ACTION_SECRET;
  } else {
    process.env.MREACT_SERVER_ACTION_SECRET = originalActionSecret;
  }
});

describe("server action token secret configuration", () => {
  test("warns in production when MREACT_SERVER_ACTION_SECRET is missing", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    delete process.env.MREACT_SERVER_ACTION_SECRET;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("../src/actions.js");

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("MREACT_SERVER_ACTION_SECRET"),
    );
  });

  test("does not warn when production uses MREACT_SERVER_ACTION_SECRET", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    process.env.MREACT_SERVER_ACTION_SECRET = "shared-secret";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("../src/actions.js");

    expect(warn).not.toHaveBeenCalled();
  });
});
