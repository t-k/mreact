import { describe, expect, test } from "vitest";
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

  test("replay nonce is only consumed on successful action", async () => {
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
    // Nonce must NOT have been consumed because the action threw.
    expect(seen.has("nonce-fail")).toBe(false);
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
});
