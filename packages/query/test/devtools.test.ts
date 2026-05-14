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
});
