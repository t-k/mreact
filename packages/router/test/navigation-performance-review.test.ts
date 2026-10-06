// @vitest-environment happy-dom

import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { buildNavigationRuntimeBundle } from "../src/client.js";
import { defineSearchState, searchParam } from "../src/search-state.js";

let bundle: string;
let sequence = 0;
let runtime: any;
const nativeFetch = globalThis.fetch;
const listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject, any]> = [];
const html = (name: string) => `<div data-mreact-route-id="${name}"><main>${name}</main></div>`;
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };

beforeAll(async () => { bundle = (await buildNavigationRuntimeBundle({ minify: false })).code; });
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
