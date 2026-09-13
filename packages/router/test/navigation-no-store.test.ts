// @vitest-environment happy-dom

import { createServer, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { buildNavigationRuntimeBundle } from "../src/client.js";

type NavigationRuntime = {
  __mreactPrefetch(url: string): Promise<boolean>;
  __mreactNavigate(url: string): Promise<boolean>;
  __mreactInvalidateNavigationCache(path: string): void;
};

const originalFetch = globalThis.fetch;
let code: string;
let sequence = 0;
let server: Server | undefined;
let requests: string[];
let firstResponse: Promise<ServerResponse>;
let receiveFirst: (response: ServerResponse) => void;
let receivedHeaders: Promise<void>;

beforeAll(async () => {
  code = (await buildNavigationRuntimeBundle({ minify: false })).code;
});

beforeEach(async () => {
  requests = [];
  firstResponse = new Promise((resolve) => {
    receiveFirst = resolve;
  });
  server = createServer((request, response) => {
    requests.push(request.url ?? "");
    if (requests.length === 1) {
      receiveFirst(response);
    } else {
      response.writeHead(200, {
        "content-type": "text/html",
        "cache-control": "private, no-store",
      });
      response.end(page("Fresh page"));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Missing test server address");
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(
    `http://127.0.0.1:${address.port}/`,
  );
  document.head.innerHTML = "";
  document.body.innerHTML = '<div data-mreact-route-id="home"><main>Home</main></div>';
  delete (globalThis as { __mreactNavigationState?: unknown }).__mreactNavigationState;
  let signalHeaders: () => void;
  receivedHeaders = new Promise((resolve) => {
    signalHeaders = resolve;
  });
  // Observe real HTTP response arrival without replacing the network or response body.
  globalThis.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    signalHeaders();
    return response;
  };
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  document.cookie = "session=; Max-Age=0; Path=/";
  if (server !== undefined) {
    const closed = once(server, "close");
    server.close();
    server.closeAllConnections();
    await closed;
    server = undefined;
  }
});

function page(text: string): string {
  return `<!DOCTYPE html><div data-mreact-route-id="private"><main>${text}</main></div>`;
}

async function runtime(): Promise<NavigationRuntime> {
  return import(
    `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}#no-store-${sequence++}`
  );
}

function expectNoStoredResponse(): void {
  const state = (
    globalThis as unknown as {
      __mreactNavigationState: {
        cache: Map<string, unknown>;
        pendingHtmlFetches: Map<string, unknown>;
        cacheTokens: Map<string, unknown>;
      };
    }
  ).__mreactNavigationState;
  expect(state.cache.size).toBe(0);
  expect(state.pendingHtmlFetches.size).toBe(0);
  expect(state.cacheTokens.size).toBe(0);
}

describe("no-store navigation single-flight over HTTP", () => {
  test.each(["private, no-store", "no-cache", "private, NO-STORE", 'no-cache="Set-Cookie"'])(
    "hands an in-flight %s prefetch to navigation without storing it",
    async (cacheControl) => {
      const route = await runtime();
      const prefetch = route.__mreactPrefetch("/private");
      const response = await firstResponse;
      const navigation = route.__mreactNavigate("/private");
      response.writeHead(200, { "content-type": "text/html", "cache-control": cacheControl });
      response.end(page("Joined page"));

      await expect(navigation).resolves.toBe(true);
      await prefetch;
      expect(requests).toEqual(["/private"]);
      expect(document.querySelector("main")?.textContent).toBe("Joined page");
      expectNoStoredResponse();

      await expect(route.__mreactNavigate("/private")).resolves.toBe(true);
      expect(requests).toEqual(["/private", "/private"]);
      expect(document.querySelector("main")?.textContent).toBe("Fresh page");
      expectNoStoredResponse();
    },
  );

  test("joins after no-store headers arrive while the response body is still streaming", async () => {
    const route = await runtime();
    const prefetch = route.__mreactPrefetch("/private");
    const response = await firstResponse;
    response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
    response.write("<!DOCTYPE html>");
    await receivedHeaders;
    const navigation = route.__mreactNavigate("/private");
    response.end(page("Streamed page"));
    await expect(navigation).resolves.toBe(true);
    await prefetch;
    expect(requests).toEqual(["/private"]);
    expect(document.querySelector("main")?.textContent).toBe("Streamed page");
    expectNoStoredResponse();
  });

  test.each(["cookie", "auth", "invalidation"])(
    "refetches a joined no-store response after %s changes",
    async (change) => {
      document.cookie = "session=old; Path=/";
      const route = await runtime();
      const prefetch = route.__mreactPrefetch("/private");
      const response = await firstResponse;
      const navigation = route.__mreactNavigate("/private");
      if (change === "cookie") document.cookie = "session=new; Path=/";
      else if (change === "auth")
        document.head.innerHTML =
          '<script id="__mreact_auth_session" type="application/json">{"user":"new"}</script>';
      else route.__mreactInvalidateNavigationCache("/private");
      response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
      response.end(page("Stale page"));
      await expect(navigation).resolves.toBe(true);
      await prefetch;
      expect(requests).toEqual(["/private", "/private"]);
      expect(document.querySelector("main")?.textContent).toBe("Fresh page");
      expectNoStoredResponse();
    },
  );

  test("shares no-store HTML when a client route also prefetches its entry script", async () => {
    document.head.innerHTML =
      '<script type="application/json" id="mreact-route-prefetch-manifest">[{"path":"/private","script":"/_mreact/private.js"}]</script>';
    const route = await runtime();
    const prefetch = route.__mreactPrefetch("/private");
    const response = await firstResponse;
    const navigation = route.__mreactNavigate("/private");
    response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
    response.end(page("Client page"));
    await expect(navigation).resolves.toBe(true);
    await prefetch;
    expect(requests).toEqual(["/private"]);
    expect(document.querySelector("main")?.textContent).toBe("Client page");
    expectNoStoredResponse();
  });

  test.each(["error", "redirect", "reload"])(
    "retries an unsuitable %s response joined from prefetch",
    async (kind) => {
      const route = await runtime();
      const prefetch = route.__mreactPrefetch("/private");
      const response = await firstResponse;
      const navigation = route.__mreactNavigate("/private");
      response.writeHead(kind === "error" ? 500 : kind === "redirect" ? 302 : 200, {
        "content-type": "text/html",
        "cache-control": "no-store",
        ...(kind === "redirect" ? { location: "/redirected" } : {}),
        ...(kind === "reload" ? { "x-mreact-navigation": "reload" } : {}),
      });
      response.end(page("Unsuitable preview"));
      await expect(navigation).resolves.toBe(true);
      await prefetch;
      expect(requests).toEqual(
        kind === "redirect" ? ["/private", "/redirected", "/private"] : ["/private", "/private"],
      );
      expect(document.querySelector("main")?.textContent).toBe("Fresh page");
      expectNoStoredResponse();
    },
  );

  test.each(["no-store", "no-cache"])(
    "refetches after a completed %s prefetch",
    async (cacheControl) => {
      const route = await runtime();
      const prefetch = route.__mreactPrefetch("/private");
      const response = await firstResponse;
      response.writeHead(200, { "content-type": "text/html", "cache-control": cacheControl });
      response.end(page("Completed preview"));
      await expect(prefetch).resolves.toBe(false);
      expectNoStoredResponse();
      await expect(route.__mreactNavigate("/private")).resolves.toBe(true);
      expect(requests).toEqual(["/private", "/private"]);
      expect(document.querySelector("main")?.textContent).toBe("Fresh page");
    },
  );

  test("refetches when the response matches the new session but its request used the old session", async () => {
    document.head.innerHTML =
      '<script id="__mreact_auth_session" type="application/json">{"user":"old"}</script>';
    const route = await runtime();
    const prefetch = route.__mreactPrefetch("/private");
    const response = await firstResponse;
    const navigation = route.__mreactNavigate("/private");
    const session =
      '<script id="__mreact_auth_session" type="application/json">{"user":"new"}</script>';
    document.head.innerHTML = session;
    response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
    response.end(page("Request from old session") + session);
    await expect(navigation).resolves.toBe(true);
    await prefetch;
    expect(requests).toEqual(["/private", "/private"]);
    expect(document.querySelector("main")?.textContent).toBe("Fresh page");
    expectNoStoredResponse();
  });

  test.each(["no-store", "public, max-age=30"])(
    "handles a new session marker on a non-speculative %s navigation",
    async (cacheControl) => {
      const route = await runtime();
      const navigation = route.__mreactNavigate("/private");
      const response = await firstResponse;
      response.writeHead(200, { "content-type": "text/html", "cache-control": cacheControl });
      response.end(
        page("Signed in") +
          '<script id="__mreact_auth_session" type="application/json">{"user":"new"}</script>',
      );
      await expect(navigation).resolves.toBe(cacheControl === "no-store");
      expect(requests).toEqual(["/private"]);
      expect(document.querySelector("main")?.textContent).toBe(
        cacheControl === "no-store" ? "Signed in" : "Home",
      );
      expectNoStoredResponse();
    },
  );

  test("discards an unsuccessful speculative response before its body finishes", async () => {
    const route = await runtime();
    const prefetch = route.__mreactPrefetch("/private");
    const response = await firstResponse;
    const navigation = route.__mreactNavigate("/private");
    response.writeHead(500, { "content-type": "text/html", "cache-control": "no-store" });
    response.write("<!DOCTYPE html><main>Unfinished error");
    await expect(navigation).resolves.toBe(true);
    await expect(prefetch).resolves.toBe(false);
    expect(requests).toEqual(["/private", "/private"]);
    expect(document.querySelector("main")?.textContent).toBe("Fresh page");
    expectNoStoredResponse();
  });

  test.each(["redirect", "empty", "reload"])(
    "keeps the document for a direct navigation requiring %s fallback",
    async (kind) => {
      const route = await runtime();
      const navigation = route.__mreactNavigate("/private");
      const response = await firstResponse;
      response.writeHead(kind === "redirect" ? 302 : kind === "empty" ? 204 : 200, {
        "content-type": "text/html",
        "cache-control": "no-store",
        ...(kind === "redirect" ? { location: "/redirected" } : {}),
        ...(kind === "reload" ? { "x-mreact-navigation": "reload" } : {}),
      });
      response.end(kind === "empty" ? undefined : page("Needs document navigation"));
      await expect(navigation).resolves.toBe(false);
      expect(requests).toEqual(kind === "redirect" ? ["/private", "/redirected"] : ["/private"]);
      expect(document.querySelector("main")?.textContent).toBe("Home");
      expectNoStoredResponse();
    },
  );

  test("retains cacheable completed prefetches for later navigation", async () => {
    const route = await runtime();
    const prefetch = route.__mreactPrefetch("/private");
    const response = await firstResponse;
    response.writeHead(200, { "content-type": "text/html", "cache-control": "public, max-age=30" });
    response.end(page("Cached public page"));
    await expect(prefetch).resolves.toBe(true);
    await expect(route.__mreactNavigate("/private")).resolves.toBe(true);
    expect(requests).toEqual(["/private"]);
    expect(document.querySelector("main")?.textContent).toBe("Cached public page");
  });
});
