import { describe, expect, test } from "vitest";
import { createServerActionHandler } from "../src/index.js";

describe("createServerActionHandler validation branches", () => {
  const nestedArray = (depth: number): unknown[] => {
    let value: unknown[] = ["leaf"];
    for (let i = 0; i < depth; i += 1) {
      value = [value];
    }
    return value;
  };

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

  test("rejects deeply nested args before validation, authorization, or action invocation", async () => {
    let invocations = 0;
    let validations = 0;
    let authorizations = 0;
    const handle = createServerActionHandler(
      {
        "actions/save#save": {
          action: () => {
            invocations += 1;
          },
          validateArgs: () => {
            validations += 1;
            return true;
          },
        },
      },
      {
        authorize: () => {
          authorizations += 1;
          return true;
        },
        csrf: false,
      },
    );
    const response = await handle(
      sameOriginPost({
        moduleId: "actions/save",
        exportName: "save",
        args: [nestedArray(80)],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Invalid server action argument structure.",
    });
    expect(validations).toBe(0);
    expect(authorizations).toBe(0);
    expect(invocations).toBe(0);
  });

  test("rejects deeply nested bound args before action invocation", async () => {
    let invocations = 0;
    const handle = createServerActionHandler(
      {
        "actions/save#save": () => {
          invocations += 1;
        },
      },
      { csrf: false },
    );
    const response = await handle(
      sameOriginPost({
        moduleId: "actions/save",
        exportName: "save",
        bound: [nestedArray(80)],
        args: [],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Invalid server action argument structure.",
    });
    expect(invocations).toBe(0);
  });

  test("rejects excessive server action array lengths before action invocation", async () => {
    let invocations = 0;
    const handle = createServerActionHandler(
      {
        "actions/save#save": () => {
          invocations += 1;
        },
      },
      { csrf: false },
    );
    const response = await handle(
      sameOriginPost({
        moduleId: "actions/save",
        exportName: "save",
        args: [Array.from({ length: 2_001 }, (_, index) => index)],
      }),
    );

    expect(response.status).toBe(400);
    expect(invocations).toBe(0);
  });

  test("rejects excessive server action object key counts before action invocation", async () => {
    let invocations = 0;
    const handle = createServerActionHandler(
      {
        "actions/save#save": () => {
          invocations += 1;
        },
      },
      { csrf: false },
    );
    const response = await handle(
      sameOriginPost({
        moduleId: "actions/save",
        exportName: "save",
        args: [Object.fromEntries(Array.from({ length: 201 }, (_, index) => [`k${index}`, index]))],
      }),
    );

    expect(response.status).toBe(400);
    expect(invocations).toBe(0);
  });

  test("rejects prototype-shaped keys in server action JSON arguments", async () => {
    let invocations = 0;
    const handle = createServerActionHandler(
      {
        "actions/save#save": () => {
          invocations += 1;
        },
      },
      { csrf: false },
    );
    const response = await handle(
      sameOriginPost({
        moduleId: "actions/save",
        exportName: "save",
        args: [JSON.parse('{"__proto__":{"polluted":true}}')],
      }),
    );

    expect(response.status).toBe(400);
    expect(invocations).toBe(0);
    expect(({} as { polluted?: true }).polluted).toBeUndefined();
  });
});
