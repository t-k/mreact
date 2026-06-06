import { AsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it } from "vitest";
import {
  __resetQueryClientForTesting,
  createQueryClient,
  getQueryClient,
  installQueryAsyncStorage,
  runWithQueryClient,
  type QueryClient,
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

  it("keeps concurrent async request scopes isolated", async () => {
    __resetQueryClientForTesting();
    installQueryAsyncStorage(new AsyncLocalStorage<QueryClient>());
    const first = createQueryClient();
    const second = createQueryClient();
    first.setQueryData(["profile"], { name: "Ada" });
    second.setQueryData(["profile"], { name: "Grace" });
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const firstRun = runWithQueryClient(first, async () => {
      await firstGate;
      return getQueryClient().getQueryData<{ name: string }>(["profile"])?.name;
    });
    const secondRun = runWithQueryClient(second, async () => {
      releaseFirst();
      await Promise.resolve();
      return getQueryClient().getQueryData<{ name: string }>(["profile"])?.name;
    });

    await expect(Promise.all([firstRun, secondRun])).resolves.toEqual(["Ada", "Grace"]);
  });
});
