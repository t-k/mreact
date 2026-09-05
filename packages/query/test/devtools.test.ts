import { afterEach, describe, expect, test } from "vitest";
import { installDevtools, type Devtools } from "@reckona/mreact-devtools";
import { createQueryClient } from "../src/index.js";

let activeDevtools: Devtools | undefined;

afterEach(() => {
  activeDevtools?.dispose();
  activeDevtools = undefined;
});

describe("query devtools instrumentation", () => {
  test("emits opt-in query status events through the global devtools hook", async () => {
    const devtools = installDevtools();
    activeDevtools = devtools;
    const client = createQueryClient();

    await client.fetchQuery({
      queryKey: ["profile"],
      queryFn: () => ({ name: "Ada" }),
    });

    expect(devtools.events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          package: "@reckona/mreact-query",
          queryKey: ["profile"],
          status: "success",
          type: "query:update",
        }),
      ]),
    );
  });

  test("does not construct query devtools events when no devtools is installed", () => {
    const client = createQueryClient();
    const originalDateNow = Date.now;
    let dateNowCalls = 0;

    try {
      Date.now = () => {
        dateNowCalls += 1;
        return originalDateNow();
      };

      client.setQueryData(["profile"], { name: "Ada" });
    } finally {
      Date.now = originalDateNow;
    }

    expect(dateNowCalls).toBe(1);
  });

  test("uses opaque resource owners when query keys contain sensitive values", () => {
    const devtools = installDevtools();
    activeDevtools = devtools;
    const client = createQueryClient();

    client.setQueryData(["private", { token: "secret-token" }], "cached");

    const records = devtools.resources().snapshot();
    expect(records).toEqual([expect.objectContaining({ kind: "inactive-query", status: "live" })]);
    expect(records[0]?.ownerId).toMatch(/^query:/);
    expect(records[0]?.ownerId).not.toContain("secret-token");
  });
});
