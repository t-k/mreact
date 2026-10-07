import { afterEach, describe, expect, test, vi } from "vitest";
import { createServerActionHandler, type ServerActionValidationResult } from "../src/index.js";

function request() {
  return new Request("https://app.test/_mreact/action", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.test" },
    body: JSON.stringify({ moduleId: "actions", exportName: "save", args: [] }),
  });
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("Server Action security boundaries", () => {
  test.each([undefined, null, false, 0, 1])("denies a configured authorize returning %j", async (result) => {
    const action = vi.fn(() => "saved");
    const handle = createServerActionHandler({ "actions#save": action }, {
      csrf: false,
      authorize: async () => result as ServerActionValidationResult,
    });
    const response = await handle(request());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Server action not authorized." });
    expect(action).not.toHaveBeenCalled();
  });

  test.each([undefined, null, false, 0, 1])("denies a configured validator returning %j", async (result) => {
    const action = vi.fn(() => "saved");
    const authorize = vi.fn(() => true);
    const handle = createServerActionHandler({ "actions#save": {
      action, validateArgs: () => result as ServerActionValidationResult,
    } }, { csrf: false, authorize });
    const response = await handle(request());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Invalid server action arguments." });
    expect(action).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
  });

  test.each(["production", "development", "test", undefined])("keeps unexpected failures private in %j", async (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("database password=probe-secret");
    const handle = createServerActionHandler({ "actions#save": () => { throw failure; } }, { csrf: false });
    const first = await handle(request());
    const second = await handle(request());
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(first.status).toBe(500);
    expect(firstBody).toEqual({ ok: false, error: "Server action failed.", errorId: expect.any(String) });
    expect(firstBody.errorId).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondBody.errorId).not.toBe(firstBody.errorId);
    expect(log).toHaveBeenCalledWith("mreact-server: Server action failed.", { errorId: firstBody.errorId, error: failure });
  });

  test.each([undefined, null, "probe-secret", { toString() { throw new Error("do not stringify"); } }])(
    "treats any thrown value as a private failure: %j", async (failure) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      let finalizations = 0;
      const handle = createServerActionHandler({ "actions#save": () => { throw failure; } }, {
        csrf: false,
        replayProtection: { store: { claim: () => ({ status: "claimed", finalize() { finalizations += 1; } }) } },
      });
      const req = request();
      req.headers.set("x-mreact-action-nonce", "nonce");
      const response = await handle(req);
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ ok: false, error: "Server action failed.", errorId: expect.any(String) });
      expect(finalizations).toBe(1);
      expect(log).toHaveBeenCalledWith("mreact-server: Server action failed.", { errorId: body.errorId, error: failure });
    },
  );

  test.each(["authorize", "validateArgs"] as const)("contains unexpected %s exceptions", async (guard) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const action = vi.fn();
    const fail = () => { throw new Error("guard probe-secret"); };
    const handle = createServerActionHandler({ "actions#save": { action, ...(guard === "validateArgs" ? { validateArgs: fail } : {}) } }, {
      csrf: false, ...(guard === "authorize" ? { authorize: fail } : {}),
    });
    const response = await handle(request());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Server action failed.", errorId: expect.any(String) });
    expect(action).not.toHaveBeenCalled();
  });
});
