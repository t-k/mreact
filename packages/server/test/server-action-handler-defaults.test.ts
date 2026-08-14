import { describe, expect, test, vi } from "vitest";
import { createServerActionHandler } from "../src/index.js";

const actions = {
  "actions/save#save": (...args: unknown[]) => ({ args }),
};

describe("createServerActionHandler secure defaults (Issue 076)", () => {
  test("rejects cross-origin POST by default", async () => {
    const handle = createServerActionHandler(actions);
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.test",
        },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [],
        }),
      }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Origin not allowed.",
    });
  });

  test("requires CSRF token by default (returns 403 without cookie+header)", async () => {
    const handle = createServerActionHandler(actions);
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
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Invalid CSRF token.",
    });
  });

  test("accepts same-origin POST with matching CSRF cookie + header", async () => {
    const handle = createServerActionHandler(actions);
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.test",
          cookie: "mreact.csrf=t1",
          "x-mreact-csrf": "t1",
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

  test("allowedOrigins='any' disables the origin check", async () => {
    const handle = createServerActionHandler(actions, {
      allowedOrigins: "any",
      csrf: false,
    });
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.test",
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

  test("rejects payloads larger than maxBodyBytes (default 1 MiB)", async () => {
    const handle = createServerActionHandler(actions, {
      csrf: false,
      maxBodyBytes: 64,
    });
    const big = JSON.stringify({
      moduleId: "actions/save",
      exportName: "save",
      args: ["x".repeat(100)],
    });
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(big.length),
        },
        body: big,
      }),
    );
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Payload too large.",
    });
  });

  test("replay nonce remains consumed when an invoked action throws", async () => {
    const seen = new Set<string>();
    const handle = createServerActionHandler(
      {
        "actions/fail#fail": () => {
          throw new Error("boom");
        },
      },
      {
        csrf: false,
        replayProtection: { seen },
      },
    );
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-mreact-action-nonce": "nonce-fail",
        },
        body: JSON.stringify({
          moduleId: "actions/fail",
          exportName: "fail",
          args: [],
        }),
      }),
    );
    expect(response.status).toBe(500);
    expect(seen.has("nonce-fail")).toBe(true);
    const replay = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-mreact-action-nonce": "nonce-fail",
        },
        body: JSON.stringify({ moduleId: "actions/fail", exportName: "fail", args: [] }),
      }),
    );
    expect(replay.status).toBe(409);
  });

  test("replay nonce is consumed on successful action", async () => {
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
          "x-mreact-action-nonce": "nonce-ok",
        },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [],
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(seen.has("nonce-ok")).toBe(true);
  });

  test("allows exactly one concurrent action invocation for a nonce", async () => {
    const seen = new Set<string>();
    let calls = 0;
    let release!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handle = createServerActionHandler(
      {
        "actions/save#save": async () => {
          calls += 1;
          markStarted();
          await blocked;
          return "saved";
        },
      },
      { csrf: false, replayProtection: { seen } },
    );
    const request = () =>
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-mreact-action-nonce": "nonce-concurrent",
        },
        body: JSON.stringify({ moduleId: "actions/save", exportName: "save", args: [] }),
      });

    const first = handle(request());
    await started;
    const second = handle(request());
    release();

    expect([(await first).status, (await second).status].sort()).toEqual([200, 409]);
    expect(calls).toBe(1);
  });

  test("readCookie tolerates malformed percent-encoding (Issue 072 sibling)", async () => {
    const handle = createServerActionHandler(actions);
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.test",
          cookie: "mreact.csrf=%ZZ",
          "x-mreact-csrf": "anything",
        },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [],
        }),
      }),
    );
    // Malformed cookie => cookieToken undefined => CSRF check fails
    // cleanly with 403 (not 500 from a URIError throw).
    expect(response.status).toBe(403);
  });

  test("readCookie skips URI decoding for raw CSRF cookie values without percent escapes", async () => {
    const decode = vi.spyOn(globalThis, "decodeURIComponent");
    const handle = createServerActionHandler(actions);

    try {
      const response = await handle(
        new Request("https://app.test/_mreact/action", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://app.test",
            cookie: "mreact.csrf=token-123",
            "x-mreact-csrf": "token-123",
          },
          body: JSON.stringify({
            moduleId: "actions/save",
            exportName: "save",
            args: [],
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(decode).not.toHaveBeenCalled();
    } finally {
      decode.mockRestore();
    }
  });
});
