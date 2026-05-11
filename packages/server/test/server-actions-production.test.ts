import { describe, expect, test } from "vitest";
import { createFetchServerReferenceCaller } from "../../react-compat/src/flight.js";
import { createServerActionHandler } from "../src/index.js";

describe("Server Actions production transport", () => {
  test("runs with origin CSRF nonce authorization and bound args", async () => {
    const actionCalls: unknown[][] = [];
    let transportInit: RequestInit | undefined;
    const handleAction = createServerActionHandler(
      {
        "actions/todos#save": {
          action: (workspaceId: string, title: string) => {
            actionCalls.push([workspaceId, title]);
            return { id: "todo-1", workspaceId, title };
          },
          validateArgs: (args) =>
            args.length === 2 &&
            typeof args[0] === "string" &&
            typeof args[1] === "string",
        },
      },
      {
        allowedOrigins: ["https://app.test"],
        csrf: true,
        replayProtection: { seen: new Set<string>() },
        authorize(request, reference, args) {
          return request.headers.get("authorization") === "Bearer session-1" &&
            reference.moduleId === "actions/todos" &&
            args[0] === "workspace-1";
        },
      },
    );
    const callServerReference = createFetchServerReferenceCaller(
      "https://app.test/_mreact/action",
      {
        csrfToken: "csrf-1",
        nonce: "nonce-1",
        headers: {
          authorization: "Bearer session-1",
          cookie: "mreact.csrf=csrf-1",
          origin: "https://app.test",
        },
        fetch(input, init) {
          transportInit = init;
          return handleAction(
            new Request(String(input), {
              method: init?.method,
              headers: init?.headers,
              body: init?.body,
            }),
          );
        },
      },
    );

    await expect(
      callServerReference(
        {
          id: 0,
          moduleId: "actions/todos",
          exportName: "save",
          bound: ["workspace-1"],
        },
        ["Ship Flight"],
      ),
    ).resolves.toEqual({
      id: "todo-1",
      workspaceId: "workspace-1",
      title: "Ship Flight",
    });

    expect(transportInit?.credentials).toBe("same-origin");
    expect(actionCalls).toEqual([["workspace-1", "Ship Flight"]]);
  });
});
