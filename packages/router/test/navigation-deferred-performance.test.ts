// @vitest-environment happy-dom

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { afterEach, beforeAll, beforeEach, expect, test, vi, type Mock } from "vitest";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: Error) => void };
const globals = globalThis as any;
const targetModule = "../../../coverage/mutation-src/deferred-navigation-target.js";
let source: string;
let runtime: any;
let imported: Deferred<Record<string, unknown>>;
let importFactory: Mock<() => Promise<Record<string, unknown>>>;
let locationStub: { href: string; origin: string; pathname: string; search: string; hash: string; reload: ReturnType<typeof vi.fn> };
let fallbackDestinations: string[];
let popstate: (event: { state: unknown }) => void;

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function emittedDeferredRuntime(text: string): string {
  const match = text.match(/const deferredNavigationRuntime = deferredClientNavigation\s*\? (`[\s\S]*?`)\s*:\s*"";/);
  if (match === null) throw new Error("The actual deferred navigation template was not found");
  // Evaluate the repository's template literal, preserving its emitted escaping.
  const code = new Function(`return ${match[1]};`)() as string;
  return `const __mreactGlobal = globalThis;\n${code}\nexport { __mreactInstallNavigation, __mreactDeferredHandleClick };\n`;
}

beforeAll(async () => {
  source = await readFile(process.env.MREACT_REVIEW_CLIENT_SOURCE ?? "packages/router/src/client.ts", "utf8");
  if (process.env.MREACT_REVIEW_DEFERRED_MUTATION !== "1") {
    await mkdir("coverage/mutation-src", { recursive: true });
    await writeFile("coverage/mutation-src/deferred-navigation-runtime-normal.js", emittedDeferredRuntime(source));
    await writeFile("coverage/mutation-src/deferred-navigation-target.js", "export {};\n");
  }
});

beforeEach(async () => {
  vi.resetModules();
  imported = deferred();
  importFactory = vi.fn(() => imported.promise);
  vi.doMock(targetModule, importFactory);
  delete globals.__mreactNavigationState;
  delete globals.__mreactDeferredNavigationOperation;
  delete globals.__mreactPendingHistoryTraversal;
  locationStub = { href: "http://localhost/", origin: "http://localhost", pathname: "/", search: "", hash: "", reload: vi.fn() };
  fallbackDestinations = [];
  let href = locationStub.href;
  Object.defineProperty(locationStub, "href", {
    get: () => href,
    set: (value: string) => { fallbackDestinations.push(value); href = value; },
  });
  vi.stubGlobal("location", locationStub);
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("addEventListener", vi.fn((name, listener) => { if (name === "popstate") popstate = listener; }));
  vi.spyOn(document, "addEventListener").mockImplementation(() => {});
  document.body.innerHTML = '<script id="mreact-navigation-runtime" type="application/json">{"script":"/coverage/mutation-src/deferred-navigation-target.js"}</script>';
  const modulePath = process.env.MREACT_REVIEW_DEFERRED_MUTATION === "1"
    ? "../../../coverage/mutation-src/deferred-navigation-runtime.js"
    : "../../../coverage/mutation-src/deferred-navigation-runtime-normal.js";
  // Standard imports keep Stryker activation and the runtime in Vitest's module realm.
  runtime = await import(modulePath);
  runtime.__mreactInstallNavigation();
});

afterEach(() => {
  vi.doUnmock(targetModule);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete globals.__mreactNavigationState;
  delete globals.__mreactDeferredNavigationOperation;
  delete globals.__mreactPendingHistoryTraversal;
  delete globals.__mreactNavigate;
});

function click(path: string, options: { scroll?: string; transition?: string } = {}) {
  const anchor = document.createElement("a");
  anchor.href = `http://localhost${path}`;
  if (options.scroll !== undefined) anchor.dataset.mreactScroll = options.scroll;
  if (options.transition !== undefined) anchor.dataset.mreactTransition = options.transition;
  const event = { target: anchor, button: 0, defaultPrevented: false, preventDefault: vi.fn() };
  runtime.__mreactDeferredHandleClick(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  return globals.__mreactNavigationState?.operation ?? globals.__mreactDeferredNavigationOperation;
}

async function completeImport(exports: Record<string, unknown> = {}, handOff = true) {
  if (handOff) globals.__mreactNavigationState = { operation: globals.__mreactDeferredNavigationOperation, installed: true };
  imported.resolve({ __mreactNavigate: undefined, ...exports });
  await vi.dynamicImportSettled();
  for (let index = 0; index < 20; index++) await Promise.resolve();
}

test("a later first popstate owns a pending click import", async () => {
  const navigate = vi.fn(() => true);
  const first = click("/A");
  const state = { __mreact: true, url: "http://localhost/B", html: "B" };
  popstate({ state });
  expect(globals.__mreactPendingHistoryTraversal.state).toBe(state);
  expect(globals.__mreactPendingHistoryTraversal.operation).not.toBe(first);
  await completeImport({ __mreactNavigate: navigate });
  expect(navigate).not.toHaveBeenCalled();
  expect(locationStub.href).toBe("http://localhost/");
  expect(locationStub.reload).not.toHaveBeenCalled();
});

test("a later click owns a pending first popstate import", async () => {
  popstate({ state: { __mreact: true, url: "http://localhost/A", html: "A" } });
  const first = globals.__mreactPendingHistoryTraversal.operation;
  const latest = click("/B", { scroll: "preserve", transition: "auto" });
  expect(latest).not.toBe(first);
  const navigate = vi.fn(() => true);
  await completeImport({ __mreactNavigate: navigate });
  expect(navigate).toHaveBeenCalledExactlyOnceWith("http://localhost/B", { scroll: false, transition: "auto" }, latest);
  expect(locationStub.reload).not.toHaveBeenCalled();
  expect(locationStub.href).toBe("http://localhost/");
});

test("a rejected shared import falls back only to the latest click", async () => {
  click("/A");
  click("/B");
  imported.reject(new Error("navigation chunk unavailable"));
  await vi.dynamicImportSettled();
  for (let index = 0; index < 20; index++) await Promise.resolve();
  expect(locationStub.href).toBe("http://localhost/B");
  expect(fallbackDestinations).toEqual(["http://localhost/B"]);
  expect(importFactory).toHaveBeenCalledOnce();
});

test("the latest history traversal reloads if its runtime import fails", async () => {
  popstate({ state: { url: "/A" } });
  popstate({ state: { url: "/B" } });
  imported.reject(new Error("navigation chunk unavailable"));
  await vi.dynamicImportSettled();
  expect(locationStub.reload).toHaveBeenCalledOnce();
  expect(globals.__mreactPendingHistoryTraversal.state).toEqual({ url: "/B" });
});

test("installed runtime owns popstate without creating another deferred operation", async () => {
  const current = {};
  globals.__mreactNavigationState = { installed: true, operation: current };
  popstate({ state: { url: "/B" } });
  expect(globals.__mreactNavigationState.operation).toBe(current);
  expect(globals.__mreactPendingHistoryTraversal).toBeUndefined();
  expect(importFactory).not.toHaveBeenCalled();
});

test("programmatic calls hand off only the latest validated destination", async () => {
  const first = runtime.__mreactNavigate("/A");
  const options = { scroll: false, type: "replace" };
  const latest = runtime.__mreactNavigate("/B", options);
  const operation = globals.__mreactDeferredNavigationOperation;
  const navigate = vi.fn(() => true);
  await completeImport({ __mreactNavigate: navigate });
  expect(await first).toBe("superseded");
  expect(await latest).toBe(true);
  expect(navigate).toHaveBeenCalledExactlyOnceWith("http://localhost/B", options, operation);
});

test.each(["https://elsewhere.test/", "javascript:alert(1)", "blob:http://localhost/a", "http://["])("invalid programmatic destination %s preserves the current owner", async (url) => {
  const pending = runtime.__mreactNavigate("/A");
  const owner = globals.__mreactDeferredNavigationOperation;
  const invalid = runtime.__mreactNavigate(url);
  expect(globals.__mreactDeferredNavigationOperation).toBe(owner);
  expect(await invalid).toBe(false);
  expect(globals.__mreactDeferredNavigationOperation).toBe(owner);
  const navigate = vi.fn(() => true);
  await completeImport({ __mreactNavigate: navigate });
  expect(await pending).toBe(true);
  expect(navigate).toHaveBeenCalledExactlyOnceWith("http://localhost/A", {}, owner);
});

test("same-origin HTTPS programmatic navigation hands off its normalized URL", async () => {
  locationStub.origin = "https://localhost";
  // Set the current address before recording any navigation fallback.
  locationStub.href = "https://localhost/";
  fallbackDestinations.length = 0;
  const first = runtime.__mreactNavigate("/secure");
  const owner = globals.__mreactDeferredNavigationOperation;
  const navigate = vi.fn(() => true);
  await completeImport({ __mreactNavigate: navigate });
  expect(await first).toBe(true);
  expect(navigate).toHaveBeenCalledExactlyOnceWith("https://localhost/secure", {}, owner);
  expect(fallbackDestinations).toEqual([]);
});

test("a rejected programmatic import returns fallback without throwing", async () => {
  const first = runtime.__mreactNavigate("/A");
  imported.reject(new Error("navigation chunk unavailable"));
  expect(await first).toBe(false);
  expect(fallbackDestinations).toEqual([]);
});

test.each(["resolve", "reject"])("a programmatic %s after runtime hand-off cannot replace a newer owner", async (completion) => {
  const result = deferred<boolean>();
  const navigate = vi.fn(() => result.promise);
  const first = runtime.__mreactNavigate("/A");
  await completeImport({ __mreactNavigate: navigate });
  const latest = {};
  globals.__mreactNavigationState.operation = latest;
  if (completion === "resolve") result.resolve(false);
  else result.reject(new Error("stale request"));
  expect(await first).toBe("superseded");
  expect(globals.__mreactNavigationState.operation).toBe(latest);
});

test("a current programmatic failure propagates to its caller", async () => {
  const error = new Error("current navigation failed");
  const result = deferred<boolean>();
  const first = runtime.__mreactNavigate("/A");
  const assertion = expect(first).rejects.toBe(error);
  await completeImport({ __mreactNavigate: () => result.promise });
  result.reject(error);
  await assertion;
});

test("a current runtime false result reaches the programmatic caller", async () => {
  const first = runtime.__mreactNavigate("/A");
  await completeImport({});
  expect(await first).toBe(false);
});

test("a click fallback checks ownership again after its runtime result", async () => {
  const result = deferred<boolean>();
  click("/A");
  const navigate = vi.fn(() => result.promise);
  await completeImport({ __mreactNavigate: navigate });
  const second = runtime.__mreactNavigate("/B");
  result.resolve(false);
  for (let index = 0; index < 20; index++) await Promise.resolve();
  expect(locationStub.href).toBe("http://localhost/");
  expect(await second).toBe(false);
});

test("a current click rejection falls back and a stale rejection does not", async () => {
  const firstResult = deferred<boolean>();
  const secondResult = deferred<boolean>();
  const navigate = vi.fn().mockReturnValueOnce(firstResult.promise).mockReturnValueOnce(secondResult.promise);
  click("/A");
  await completeImport({ __mreactNavigate: navigate });
  click("/B");
  for (let index = 0; index < 20; index++) await Promise.resolve();
  firstResult.reject(new Error("stale click"));
  for (let index = 0; index < 20; index++) await Promise.resolve();
  expect(locationStub.href).toBe("http://localhost/");
  secondResult.reject(new Error("current click"));
  for (let index = 0; index < 20; index++) await Promise.resolve();
  expect(locationStub.href).toBe("http://localhost/B");
});

test("the normal runtime accepts a current hand-off and rejects a stale third operation", async () => {
  const match = source.match(/export async function __mreactNavigate\(url, options = \{\}, operation\) \{[\s\S]*?\n\}/);
  expect(match, "The actual normal navigation function must be present").not.toBeNull();
  const state: any = { operation: {} };
  const resolveHtml = vi.fn(async () => undefined);
  const setState = vi.fn();
  const navigate = new Function("__mreactNavigationState", "__mreactNormalizeNavigationUrl", "__mreactIsSameOriginNavigationUrl", "__mreactSetNavigationState", "__mreactPendingNavigationState", "__mreactIdleNavigationState", "__mreactResolveNavigationHtml", "__mreactApplyNavigationHtmlWithOptionalTransition", `return (${match![0].replace("export ", "")});`)(state, (url: string) => new URL(url, "http://localhost/").href, () => true, setState, (url: string) => ({ pending: true, to: url }), () => ({ pending: false }), resolveHtml, vi.fn());
  const current = state.operation;
  expect(await navigate("/A", {}, {})).toBe("superseded");
  expect(resolveHtml).not.toHaveBeenCalled();
  expect(setState).not.toHaveBeenCalled();
  expect(state.operation).toBe(current);
  expect(await navigate("/B", {}, current)).toBe(false);
  expect(resolveHtml).toHaveBeenCalledExactlyOnceWith("http://localhost/B", current);
  expect(state.operation).toBe(current);
});
