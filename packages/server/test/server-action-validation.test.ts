import { describe, expect, test } from "vitest";
import { createServerActionHandler } from "../src/index.js";

describe("createServerActionHandler validation branches", () => {
  const actions = {
    "actions/save#save": (...args: unknown[]) => ({ ok: true, args }),
    "actions/fail#fail": () => {
      throw new Error("boom");
    },
  };

  const sameOriginPost = (body: unknown) =>
    new Request("https://app.test/_mreact/action", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.test",
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  test("non-POST methods return 405", async () => {
    const handle = createServerActionHandler(actions, { csrf: false });
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "GET",
        headers: { origin: "https://app.test" },
      }),
    );
    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Method not allowed.",
    });
  });

  test("missing moduleId / exportName returns 400 'Invalid server action reference.'", async () => {
    const handle = createServerActionHandler(actions, { csrf: false });
    const response = await handle(sameOriginPost({ moduleId: "actions/save", args: [] }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Invalid server action reference.",
    });
  });

  test("unknown server action returns 404", async () => {
    const handle = createServerActionHandler(actions, { csrf: false });
    const response = await handle(
      sameOriginPost({
        moduleId: "actions/save",
        exportName: "unknown",
        args: [],
      }),
    );
    expect(response.status).toBe(404);
  });

  test("argument validation that returns a string surfaces that string in the 400 response", async () => {
    const handle = createServerActionHandler(
      {
        "actions/save#save": {
          action: (...args: unknown[]) => ({ args }),
          validateArgs: () => "Bad arguments",
        },
      },
      { csrf: false },
    );
    const response = await handle(
      sameOriginPost({
        moduleId: "actions/save",
        exportName: "save",
        args: ["x"],
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Bad arguments",
    });
  });

  test("argument validation that returns false (non-true) uses the generic 400 message", async () => {
    const handle = createServerActionHandler(
      {
        "actions/save#save": {
          action: (...args: unknown[]) => ({ args }),
          validateArgs: () => false,
        },
      },
      { csrf: false },
    );
    const response = await handle(
      sameOriginPost({
        moduleId: "actions/save",
        exportName: "save",
        args: [],
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Invalid server action arguments.",
    });
  });

  test("authorize hook returning a string yields a 403 with that message", async () => {
    const handle = createServerActionHandler(actions, {
      csrf: false,
      authorize: () => "Not allowed for this user",
    });
    const response = await handle(
      sameOriginPost({
        moduleId: "actions/save",
        exportName: "save",
        args: [],
      }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Not allowed for this user",
    });
  });

  test("authorize hook returning false yields a 403 with the generic message", async () => {
    const handle = createServerActionHandler(actions, {
      csrf: false,
      authorize: () => false,
    });
    const response = await handle(
      sameOriginPost({
        moduleId: "actions/save",
        exportName: "save",
        args: [],
      }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Server action not authorized.",
    });
  });

  test("action throws return 500 with the message", async () => {
    const handle = createServerActionHandler(actions, { csrf: false });
    const response = await handle(
      sameOriginPost({
        moduleId: "actions/fail",
        exportName: "fail",
        args: [],
      }),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "boom",
    });
  });

  test("action throws a non-Error value uses String() coercion for the error message", async () => {
    const handle = createServerActionHandler(
      {
        "actions/save#save": () => {
          // eslint-disable-next-line no-throw-literal
          throw "literal-string-error";
        },
      },
      { csrf: false },
    );
    const response = await handle(
      sameOriginPost({
        moduleId: "actions/save",
        exportName: "save",
        args: [],
      }),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "literal-string-error",
    });
  });

  test("bound + extra args are concatenated when the body shapes them as separate arrays", async () => {
    const handle = createServerActionHandler(actions, { csrf: false });
    const response = await handle(
      sameOriginPost({
        moduleId: "actions/save",
        exportName: "save",
        bound: ["bound-a", "bound-b"],
        args: ["extra"],
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      value: { ok: true, args: ["bound-a", "bound-b", "extra"] },
    });
  });
});
