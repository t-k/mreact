// @vitest-environment happy-dom

import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { buildNavigationRuntimeBundle } from "../src/client.js";
import { defineSearchState, searchParam } from "../src/search-state.js";
import { readFile } from "node:fs/promises";

let bundle: string;
let sequence = 0;
let runtime: any;
const nativeFetch = globalThis.fetch;
const listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject, any]> = [];
const html = (name: string) => `<div data-mreact-route-id="${name}"><main>${name}</main></div>`;
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };

beforeAll(async () => {
  bundle = process.env.MREACT_REVIEW_MUTATION === "1"
    ? await readFile(new URL("../../../coverage/mutation-src/navigation-runtime.js", import.meta.url), "utf8")
    : (await buildNavigationRuntimeBundle({ minify: false })).code;
});
beforeEach(async () => {
  delete (globalThis as any).__mreactNavigationState;
  delete (document as any).startViewTransition;
  history.replaceState(null, "", "/");
  document.body.innerHTML = html("Home");
  document.head.innerHTML = "";
  globalThis.fetch = nativeFetch;
  for (const target of [window, document]) {
    const add = target.addEventListener.bind(target);
    vi.spyOn(target, "addEventListener").mockImplementation(((name: string, listener: EventListenerOrEventListenerObject, options: any) => {
      listeners.push([target, name, listener, options]);
      add(name, listener, options);
    }) as any);
  }
  runtime = await import(`data:text/javascript,${encodeURIComponent(bundle)}#performance-${sequence++}`);
});
afterEach(() => {
  for (const [target, name, listener, options] of listeners.splice(0)) target.removeEventListener(name, listener, options);
  (globalThis as any).__mreactNavigationState?.viewportObserver?.disconnect();
  (globalThis as any).__mreactNavigationState?.viewportMutationObserver?.disconnect();
  vi.restoreAllMocks();
  globalThis.fetch = nativeFetch;
  delete (document as any).startViewTransition;
});

function deferredRequests() {
  const requests = new Map<string, { resolve: (response: Response) => void; reject: (error: Error) => void }>();
  globalThis.fetch = (async (url) => new Promise<Response>((resolve, reject) => requests.set(new URL(String(url)).pathname, { resolve, reject }))) as typeof fetch;
  return requests;
}

test("only the latest navigation may commit DOM, history and URL events", async () => {
  const requests = deferredRequests();
  const commits = vi.fn();
  window.addEventListener("mreact:url-commit", commits);
  const first = runtime.__mreactNavigate("/A");
  const second = runtime.__mreactNavigate("/B");
  requests.get("/B")!.resolve(new Response(html("B")));
  expect(await second).toBe(true);
  requests.get("/A")!.resolve(new Response(html("A")));
  expect(await first).toBe("superseded");
  expect(document.querySelector("main")!.textContent).toBe("B");
  expect(location.pathname).toBe("/B");
  expect(commits).toHaveBeenCalledTimes(1);
});

test.each(["resolve", "reject"])("an old %s does not settle the latest pending navigation", async (completion) => {
  const requests = deferredRequests();
  const first = runtime.__mreactNavigate("/A");
  const second = runtime.__mreactNavigate("/B");
  if (completion === "resolve") requests.get("/A")!.resolve(new Response(html("A")));
  else requests.get("/A")!.reject(new Error("stale fetch failed"));
  expect(await first).toBe("superseded");
  expect(runtime.__mreactGetNavigationState()).toMatchObject({ pending: true, to: new URL("/B", location.href).href });
  expect(document.querySelector("main")!.textContent).toBe("Home");
  requests.get("/B")!.resolve(new Response(html("B")));
  await second;
  expect(runtime.__mreactGetNavigationState().pending).toBe(false);
});

test("a superseded view transition callback cannot commit", async () => {
  globalThis.fetch = (async (url) => new Response(html(new URL(String(url)).pathname.slice(1)))) as typeof fetch;
  let callback!: () => void;
  let finish!: () => void;
  document.startViewTransition = ((update: () => void) => {
    callback = update;
    return { updateCallbackDone: new Promise<void>((resolve) => { finish = resolve; }), finished: Promise.resolve(), ready: Promise.resolve() };
  }) as any;
  const first = runtime.__mreactNavigate("/A", { transition: "auto" });
  await flush();
  expect(callback).toBeTypeOf("function");
  await runtime.__mreactNavigate("/B");
  callback();
  finish();
  expect(await first).toBe("superseded");
  expect(location.pathname).toBe("/B");
  expect(document.querySelector("main")!.textContent).toBe("B");
});

test("a synchronous history restore supersedes a pending link navigation", async () => {
  runtime.__mreactNavigateToHtml(html("Saved"), "/saved");
  const saved = { ...history.state };
  runtime.__mreactNavigateToHtml(html("Other"), "/other");
  const requests = deferredRequests();
  const navigation = runtime.__mreactNavigate("/A");
  window.dispatchEvent(new PopStateEvent("popstate", { state: saved }));
  requests.get("/A")!.resolve(new Response(html("A")));
  expect(await navigation).toBe("superseded");
  expect(document.querySelector("main")!.textContent).toBe("Saved");
});

test("search state keeps its boolean result when a navigation is superseded", async () => {
  const requests = deferredRequests();
  const search = defineSearchState({ query: searchParam.integer(0) });
  const write = search.set({ query: 1 });
  await flush();
  const latest = runtime.__mreactNavigate("/B");
  requests.get("/")!.resolve(new Response(html("Old")));
  expect(await write).toBe(false);
  requests.get("/B")!.resolve(new Response(html("B")));
  await latest;
});

test("an uncached navigation parses HTML once and a cached revisit owns a fresh fragment", async () => {
  const create = document.createElement.bind(document);
  let parses = 0;
  vi.spyOn(document, "createElement").mockImplementation(((name: string, options: any) => {
    const node = create(name, options);
    if (name === "template") {
      let prototype: any = node;
      let descriptor: PropertyDescriptor | undefined;
      while (prototype && descriptor === undefined) {
        descriptor = Object.getOwnPropertyDescriptor(prototype, "innerHTML");
        prototype = Object.getPrototypeOf(prototype);
      }
      Object.defineProperty(node, "innerHTML", {
        get() { return descriptor!.get!.call(this); },
        set(value) { parses++; descriptor!.set!.call(this, value); },
      });
    }
    return node;
  }) as any);
  globalThis.fetch = vi.fn(async () => new Response(html("A")));
  await runtime.__mreactNavigate("/A");
  expect(parses).toBe(1);
  runtime.__mreactNavigateToHtml(html("Other"), "/other");
  const before = parses;
  await runtime.__mreactNavigate("/A");
  expect(document.querySelector("main")!.textContent).toBe("A");
  expect(parses - before).toBe(1);
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});

test("shared fetch consumers apply a fragment once and reject changed auth context", async () => {
  const requests = deferredRequests();
  const first = runtime.__mreactNavigate("/A");
  const latest = runtime.__mreactNavigate("/A");
  requests.get("/A")!.resolve(new Response(html("A")));
  expect(await first).toBe("superseded");
  expect(await latest).toBe(true);
  expect(document.querySelector("main")!.textContent).toBe("A");
  const authNavigation = runtime.__mreactNavigate("/private");
  requests.get("/private")!.resolve(new Response(html("Private") + '<script id="__mreact_auth_session" type="application/json">{"user":"other"}</script>'));
  expect(await authNavigation).toBe(false);
  expect(document.querySelector("main")!.textContent).toBe("A");
});

test("navigation HTML retention is bounded by bytes and oversized pages remain navigable", async () => {
  const large = html("Large") + "x".repeat(600_000);
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response(large); }) as typeof fetch;
  await runtime.__mreactNavigate("/large");
  runtime.__mreactNavigateToHtml(html("Other"), "/other");
  await runtime.__mreactNavigate("/large");
  expect(document.querySelector("main")!.textContent).toBe("Large");
  expect(calls).toBe(2);
  const state = (globalThis as any).__mreactNavigationState;
  expect(state.cache.size).toBe(0);
  expect(state.cacheBytes).toBe(0);
});

test("HTML byte accounting follows replacement, eviction, expiry and invalidation", async () => {
  globalThis.fetch = (async () => new Response(html("Page") + "x".repeat(300_000))) as typeof fetch;
  for (let index = 0; index < 18; index++) await runtime.__mreactPrefetch(`/pages/${index}`);
  const state = (globalThis as any).__mreactNavigationState;
  const retainedBytes = () => [...state.cache.values()].reduce((total: number, entry: any) => total + entry.html.length * 2, 0);
  expect(state.cacheBytes).toBe(retainedBytes());
  expect(state.cacheBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
  expect(state.cache.size).toBeLessThan(18);
  runtime.__mreactInvalidateNavigationCache("/pages/17");
  expect(state.cacheBytes).toBe(retainedBytes());
  await runtime.__mreactPrefetch("/pages/17");
  expect(state.cacheBytes).toBe(retainedBytes());
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 30_001);
  await runtime.__mreactNavigate("/pages/17");
  expect(state.cacheBytes).toBe(retainedBytes());
  for (const href of [...state.cache.keys()]) runtime.__mreactInvalidateNavigationCache(new URL(href).pathname);
  expect(state.cache.size).toBe(0);
  expect(state.cacheBytes).toBe(0);
});

test("a superseded invalidated fetch does not retry obsolete navigation work", async () => {
  const requests = deferredRequests();
  const fetch = vi.spyOn(globalThis, "fetch");
  const first = runtime.__mreactNavigate("/A");
  const latest = runtime.__mreactNavigate("/B");
  runtime.__mreactInvalidateNavigationCache("/A");
  requests.get("/A")!.resolve(new Response(html("A")));
  await flush();
  try {
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    requests.get("/A")!.resolve(new Response(html("A")));
    requests.get("/B")!.resolve(new Response(html("B")));
    await latest;
  }
  expect(await first).toBe("superseded");
});

test("a current failed request clears its pending state and preserves fallback", async () => {
  globalThis.fetch = (async () => { throw new Error("current failure"); }) as typeof fetch;
  await expect(runtime.__mreactNavigate("/failure")).rejects.toThrow("current failure");
  expect(runtime.__mreactGetNavigationState().pending).toBe(false);
  globalThis.fetch = async () => new Response("invalid navigation HTML");
  expect(await runtime.__mreactNavigate("/invalid")).toBe(false);
  expect(document.querySelector("main")!.textContent).toBe("Home");
});

test("invalid and cross-origin destinations do not acquire navigation ownership", async () => {
  globalThis.fetch = vi.fn(async () => new Response(html("A")));
  expect(await runtime.__mreactNavigate("https://other.test/")).toBe(false);
  expect(await runtime.__mreactNavigate("http://[")).toBe(false);
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(runtime.__mreactGetNavigationState().pending).toBe(false);
});

test("a pending-state listener can synchronously supersede the navigation before fetch", async () => {
  const fetched: string[] = [];
  globalThis.fetch = (async (input) => { fetched.push(new URL(String(input)).pathname); return new Response(html("B")); }) as typeof fetch;
  let latest: Promise<unknown> | undefined;
  window.addEventListener("mreact:navigation-state-change", ((event: CustomEvent) => {
    if (event.detail.to?.endsWith("/A")) latest = runtime.__mreactNavigate("/B");
  }) as EventListener);
  expect(await runtime.__mreactNavigate("/A")).toBe("superseded");
  await latest;
  expect(fetched).toEqual(["/B"]);
  expect(location.pathname).toBe("/B");
});
