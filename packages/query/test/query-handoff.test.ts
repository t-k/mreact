import { describe, expect, it } from "vitest";
import {
  __resetQueryClientForTesting,
  createQueryClient,
  getQueryClient,
  runWithQueryClient,
} from "../src/index.js";

describe("query client hand-off", () => {
  it("returns the active request-scoped query client on the server", () => {
    __resetQueryClientForTesting();
    const requestClient = createQueryClient();
    requestClient.setQueryData(["profile"], { name: "Ada" });

    const active = runWithQueryClient(requestClient, () => getQueryClient());

    expect(active).toBe(requestClient);
    expect(active.getQueryData(["profile"])).toEqual({ name: "Ada" });
  });

  it("creates a fresh client outside a request scope on the server", () => {
    __resetQueryClientForTesting();

    const client = getQueryClient();

    expect(client.getQueryData(["profile"])).toBeUndefined();
  });
});
