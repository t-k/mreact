import { AsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it } from "vitest";
import {
  __resetQueryClientForTesting,
  createQueryClient,
  getQueryClient,
  installQueryAsyncStorage,
  isQueryClientScopeUnavailableError,
  runWithQueryClient,
  type QueryClient,
} from "../src/index.js";

describe("query client hand-off", () => {
  it("returns the active request-scoped query client on the server", () => {
    __resetQueryClientForTesting();
    installQueryAsyncStorage(new AsyncLocalStorage<QueryClient>());
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

  it("throws instead of using a module-level async fallback on the server", () => {
    __resetQueryClientForTesting();
    const requestClient = createQueryClient();

    expect(() => runWithQueryClient(requestClient, () => getQueryClient())).toThrow(
      /query client scope is unavailable/,
    );
  });

  it("brands unavailable query scope errors for adapter fallback checks", () => {
    __resetQueryClientForTesting();
    const requestClient = createQueryClient();
    let thrown: unknown;

    try {
      runWithQueryClient(requestClient, () => getQueryClient());
    } catch (error) {
      thrown = error;
    }

    expect(isQueryClientScopeUnavailableError(thrown)).toBe(true);
    expect(
      isQueryClientScopeUnavailableError(
        new Error(
          "mreact query client scope is unavailable on the server. Install AsyncLocalStorage with installQueryAsyncStorage() or run in a supported Node runtime.",
        ),
      ),
    ).toBe(false);
  });

  it("uses a global AsyncLocalStorage implementation when the server runtime provides one", () => {
    __resetQueryClientForTesting();
    const globalWithStorage = globalThis as {
      AsyncLocalStorage?: typeof AsyncLocalStorage<QueryClient>;
    };
    const previous = globalWithStorage.AsyncLocalStorage;
    globalWithStorage.AsyncLocalStorage = AsyncLocalStorage;

    try {
      const requestClient = createQueryClient();
      requestClient.setQueryData(["profile"], { name: "Ada" });

      const active = runWithQueryClient(requestClient, () => getQueryClient());

      expect(active).toBe(requestClient);
      expect(active.getQueryData(["profile"])).toEqual({ name: "Ada" });
    } finally {
      if (previous === undefined) {
        delete globalWithStorage.AsyncLocalStorage;
      } else {
        globalWithStorage.AsyncLocalStorage = previous;
      }
      __resetQueryClientForTesting();
    }
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
