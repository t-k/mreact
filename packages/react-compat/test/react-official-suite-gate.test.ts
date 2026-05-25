import { describe, expect, test } from "vitest";
import * as RealReact from "react";
import * as RealReactDom from "react-dom";
import * as RealReactDomClient from "react-dom/client";
import * as RealReactDomServer from "react-dom/server";
import * as Compat from "../src/index.js";
import * as DropInReact from "../../react/src/index.js";
import * as DropInReactDom from "../../react-dom/src/index.js";
import * as DropInReactDomClient from "../../react-dom/src/client.js";
import * as DropInReactDomServer from "../../react-dom/src/server.js";

type CoverageStatus = "covered" | "covered-stub" | "deferred" | "private";

type CoverageManifest = Record<string, CoverageStatus>;

const reactCoverage: CoverageManifest = {
  Activity: "covered",
  Children: "covered",
  Component: "covered",
  Fragment: "covered",
  Profiler: "covered",
  PureComponent: "covered",
  StrictMode: "covered",
  Suspense: "covered",
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: "private",
  __COMPILER_RUNTIME: "private",
  act: "covered",
  cache: "covered",
  cacheSignal: "covered",
  captureOwnerStack: "covered",
  cloneElement: "covered",
  createContext: "covered",
  createElement: "covered",
  createRef: "covered",
  forwardRef: "covered",
  isValidElement: "covered",
  lazy: "covered",
  memo: "covered",
  startTransition: "covered",
  unstable_useCacheRefresh: "covered",
  use: "covered",
  useActionState: "covered",
  useCallback: "covered",
  useContext: "covered",
  useDebugValue: "covered",
  useDeferredValue: "covered",
  useEffect: "covered",
  useEffectEvent: "covered",
  useId: "covered",
  useImperativeHandle: "covered",
  useInsertionEffect: "covered",
  useLayoutEffect: "covered",
  useMemo: "covered",
  useOptimistic: "covered",
  useReducer: "covered",
  useRef: "covered",
  useState: "covered",
  useSyncExternalStore: "covered",
  useTransition: "covered",
  default: "private",
  "module.exports": "private",
  version: "covered",
};

const reactDomCoverage: CoverageManifest = {
  __DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: "private",
  createPortal: "covered",
  flushSync: "covered",
  preconnect: "covered",
  prefetchDNS: "covered",
  preinit: "covered",
  preinitModule: "covered",
  preload: "covered",
  preloadModule: "covered",
  requestFormReset: "covered",
  unstable_batchedUpdates: "covered",
  useFormState: "covered",
  useFormStatus: "covered",
  default: "private",
  "module.exports": "private",
  version: "covered",
};

const reactDomClientCoverage: CoverageManifest = {
  createRoot: "covered",
  hydrateRoot: "covered",
  default: "private",
  "module.exports": "private",
  version: "covered",
};

const reactDomServerCoverage: CoverageManifest = {
  renderToPipeableStream: "covered",
  renderToReadableStream: "covered",
  renderToStaticMarkup: "covered",
  renderToString: "covered",
  resume: "covered-stub",
  resumeToPipeableStream: "covered-stub",
  default: "private",
  "module.exports": "private",
  version: "covered",
};

describe("React official suite gate", () => {
  test("classifies every React 19.2.6 export before it can be ignored", () => {
    expect(expectUnclassifiedExports("react", RealReact, reactCoverage)).toEqual([]);
    expect(expectUnclassifiedExports("react-dom", RealReactDom, reactDomCoverage)).toEqual([]);
    expect(expectUnclassifiedExports(
      "react-dom/client",
      RealReactDomClient,
      reactDomClientCoverage,
    )).toEqual([]);
    expect(expectUnclassifiedExports(
      "react-dom/server",
      RealReactDomServer,
      reactDomServerCoverage,
    )).toEqual([]);
  });

  test("covered React exports exist on compat and drop-in packages", () => {
    expect(expectCoveredExports("react compat", Compat, reactCoverage)).toEqual([]);
    expect(expectCoveredExports("react drop-in", DropInReact, reactCoverage)).toEqual([]);
    expect(expectCoveredExports("react-dom drop-in", DropInReactDom, reactDomCoverage)).toEqual([]);
    expect(expectCoveredExports(
      "react-dom/client drop-in",
      DropInReactDomClient,
      reactDomClientCoverage,
    )).toEqual([]);
    expect(expectCoveredExports(
      "react-dom/server drop-in",
      DropInReactDomServer,
      reactDomServerCoverage,
    )).toEqual([]);
  });
});

function expectUnclassifiedExports(
  packageName: string,
  moduleExports: Record<string, unknown>,
  manifest: CoverageManifest,
): string[] {
  return Object.keys(moduleExports)
    .filter((name) => manifest[name] === undefined)
    .map((name) => `${packageName}:${name}`);
}

function expectCoveredExports(
  packageName: string,
  moduleExports: Record<string, unknown>,
  manifest: CoverageManifest,
): string[] {
  return Object.entries(manifest)
    .filter(([, status]) => status === "covered" || status === "covered-stub")
    .map(([name]) => name)
    .filter((name) => moduleExports[name] === undefined)
    .map((name) => `${packageName}:${name}`);
}
