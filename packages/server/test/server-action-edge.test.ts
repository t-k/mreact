import { describe, expect, test, vi } from "vitest";
import {
  createServerActionHandler,
  type ServerActionReplayStore,
} from "../src/index.js";

const actions = {
  "actions/save#save": (...args: unknown[]) => ({ ok: true, args }),
};

const csrfHeaders = (token: string) => ({
  "content-type": "application/json",
  origin: "https://app.test",
  cookie: `mreact.csrf=${token}`,
  "x-mreact-csrf": token,
});

describe("createServerActionHandler edge branches (issues 069 / 076 / 078)", () => {
  test("allows a request whose Origin matches an explicitly-listed allowedOrigin", async () => {
    const handle = createServerActionHandler(actions, {
      allowedOrigins: ["https://other.test"],
      csrf: false,
    });
    const response = await handle(
      new Request("https://other.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://other.test",
        },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [],
        }),
      }),
    );
    expect(response.status).toBe(200);
  });

  test("treats missing Origin as same-origin and allows the request", async () => {
    const handle = createServerActionHandler(actions, { csrf: false });
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [],
        }),
      }),
    );
    expect(response.status).toBe(200);
  });

  test("rejects with 400 when replayProtection is enabled but no nonce is sent", async () => {
    const seen = new Set<string>();
    const handle = createServerActionHandler(actions, {
      csrf: false,
      replayProtection: { seen },
    });
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.test",
        },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [],
        }),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Missing server action nonce.",
    });
  });

  test("rejects with 409 when the nonce was already consumed", async () => {
    const seen = new Set<string>(["nonce-reused"]);
    const handle = createServerActionHandler(actions, {
      csrf: false,
      replayProtection: { seen },
    });
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.test",
          "x-mreact-action-nonce": "nonce-reused",
        },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [],
        }),
      }),
    );
    expect(response.status).toBe(409);
  });

  test("commits the replay nonce only after the action succeeds", async () => {
    const seen = new Set<string>();
    const handle = createServerActionHandler(actions, {
      csrf: false,
      replayProtection: { seen },
    });
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.test",
          "x-mreact-action-nonce": "fresh-nonce",
        },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: ["x"],
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(seen.has("fresh-nonce")).toBe(true);
  });

  test("diagnoses a legacy replay store once without changing the external 503", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const legacyStore = {
      add() {},
      has() {
        return false;
      },
    } as unknown as ServerActionReplayStore;
    const handle = createServerActionHandler(actions, {
      csrf: false,
      replayProtection: { store: legacyStore },
    });

    const first = await handle(replayRequest("legacy-one"));
    const second = await handle(replayRequest("legacy-two"));

    expect(first.status).toBe(503);
    expect(second.status).toBe(503);
    await expect(first.json()).resolves.toEqual({
      ok: false,
      error: "Server action replay protection is unavailable.",
    });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/claim\(\).*0\.0\.203/i),
    );
    error.mockRestore();
  });

  test("does not log or expose a replay backend error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const store: ServerActionReplayStore = {
      claim() {
        throw new Error("redis password=top-secret");
      },
    };
    const handle = createServerActionHandler(actions, {
      csrf: false,
      replayProtection: { store },
    });

    const response = await handle(replayRequest("backend-failure"));
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).not.toContain("top-secret");
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  test("CSRF allows a request whose header token matches the cookie token", async () => {
    const handle = createServerActionHandler(actions);
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: csrfHeaders("matching-token"),
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [],
        }),
      }),
    );
    expect(response.status).toBe(200);
  });

  test("CSRF rejects token mismatches with different lengths", async () => {
    const handle = createServerActionHandler(actions);
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          cookie: "mreact.csrf=matching-token-extra",
          "x-mreact-csrf": "matching-token",
        },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [],
        }),
      }),
    );
    expect(response.status).toBe(403);
  });

  test("CSRF treats a malformed cookie value as absent and returns 403", async () => {
    const handle = createServerActionHandler(actions);
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.test",
          // %ZZ is an invalid percent-escape -> decodeURIComponent throws.
          cookie: "mreact.csrf=%ZZ",
          "x-mreact-csrf": "any-token",
        },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [],
        }),
      }),
    );
    expect(response.status).toBe(403);
  });

  test("CSRF returns 403 when the request has no cookie header at all", async () => {
    const handle = createServerActionHandler(actions);
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.test",
          "x-mreact-csrf": "token",
          // No cookie header.
        },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [],
        }),
      }),
    );
    expect(response.status).toBe(403);
  });

  test("CSRF returns 403 when the cookie has the wrong name", async () => {
    const handle = createServerActionHandler(actions);
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.test",
          cookie: "other-cookie=token",
          "x-mreact-csrf": "token",
        },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [],
        }),
      }),
    );
    expect(response.status).toBe(403);
  });
});

function replayRequest(nonce: string): Request {
  return new Request("https://app.test/_mreact/action", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mreact-action-nonce": nonce,
    },
    body: JSON.stringify({
      moduleId: "actions/save",
      exportName: "save",
      args: [],
    }),
  });
}
