// @vitest-environment happy-dom

import { afterEach, describe, expect, test } from "vitest";
import {
  createElement,
  createErrorBoundary,
  createRoot,
  flushSync,
  hydrateRoot,
  startTransition,
  Suspense,
  SuspenseList,
  useDeferredValue,
  useEffect,
  useActionState,
  useOptimistic,
  useState,
  useSyncExternalStore,
  useTransition,
} from "../src/index.js";
import {
  forceFrameRate,
  setSchedulerHostForTesting,
  type SchedulerHost,
} from "../src/fiber-scheduler.js";

interface TestSchedulerHost extends SchedulerHost {
  flushOneHostCallback(): void;
  pendingHostCallbackCount(): number;
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function createTestSchedulerHost(): TestSchedulerHost {
  let time = 0;
  const callbacks: (() => void)[] = [];
  return {
    now: () => time,
    scheduleHostCallback(callback) {
      callbacks.push(callback);
      return callback;
    },
    scheduleHostTimeout(callback, ms) {
      time += ms;
      callbacks.push(callback);
      return callback;
    },
    cancelHostTimeout() {},
    flushOneHostCallback() {
      callbacks.shift()?.();
    },
    pendingHostCallbackCount() {
      return callbacks.length;
    },
  };
}

afterEach(() => {
  setSchedulerHostForTesting(undefined);
  forceFrameRate(0);
});

describe("react-compat concurrent subset", () => {
  test("Suspense renders fallback for thrown promises and retries after resolve", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let ready = false;
    let resolvePromise: () => void = () => {};
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    function AsyncChild() {
      if (!ready) {
        throw promise;
      }

      return createElement("span", null, "ready");
    }

    root.render(
      createElement(
        Suspense,
        { fallback: createElement("em", null, "loading") },
        createElement(AsyncChild, null),
      ),
    );

    expect(container.innerHTML).toBe("<em>loading</em>");

    ready = true;
    resolvePromise();
    await promise;
    await Promise.resolve();

    expect(container.innerHTML).toBe("<span>ready</span>");
  });

  test("startTransition runs its scope synchronously", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];

    calls.push("before");
    startTransition(() => {
      calls.push("transition");
    });
    calls.push("after");

    expect(calls).toEqual(["before", "transition", "after"]);
    await Promise.resolve();
    host.flushOneHostCallback();
    expect(calls).toEqual(["before", "transition", "after"]);
  });

  test("useTransition exposes pending state while scheduled work is pending", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const calls: string[] = [];
    let trigger: () => void = () => {};

    function App() {
      const [value, setValue] = useState("idle");
      const [pending, start] = useTransition();
      trigger = () => {
        calls.push("before");
        start(() => {
          calls.push("scope");
          setValue("done");
        });
        calls.push("after");
      };

      return createElement("p", null, `${pending ? "pending" : "settled"}:${value}`);
    }

    root.render(createElement(App, null));
    expect(container.innerHTML).toBe("<p>settled:idle</p>");

    trigger();
    expect(calls).toEqual(["before", "scope", "after"]);
    expect(container.innerHTML).toBe("<p>pending:idle</p>");

    await Promise.resolve();
    expect(container.innerHTML).toBe("<p>pending:idle</p>");

    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>settled:done</p>");
  });

  test("useTransition does not commit pending work after the owning component unmounts", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const calls: string[] = [];
    let trigger: () => void = () => {};

    function App() {
      const [pending, start] = useTransition();
      trigger = () => {
        start(() => {
          calls.push("transition");
        });
      };

      return createElement("p", null, pending ? "pending" : "settled");
    }

    root.render(createElement(App, null));
    trigger();
    expect(container.innerHTML).toBe("<p>pending</p>");

    root.unmount();
    host.flushOneHostCallback();

    expect(calls).toEqual(["transition"]);
    expect(container.innerHTML).toBe("");
  });

  test("an unrelated sync root does not drop useTransition work", () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const transitionContainer = document.createElement("div");
    const syncContainer = document.createElement("div");
    const transitionRoot = createRoot(transitionContainer);
    const syncRoot = createRoot(syncContainer);
    let beginTransition = () => undefined;
    let updateSyncRoot = () => undefined;

    function TransitionApp() {
      const [value, setValue] = useState("idle");
      const [pending, start] = useTransition();
      beginTransition = () => start(() => setValue("done"));
      return createElement("p", null, `${pending ? "pending" : "settled"}:${value}`);
    }

    function SyncApp() {
      const [count, setCount] = useState(0);
      updateSyncRoot = () => setCount((value) => value + 1);
      return createElement("p", null, count);
    }

    transitionRoot.render(createElement(TransitionApp, null));
    syncRoot.render(createElement(SyncApp, null));
    beginTransition();
    flushSync(updateSyncRoot);

    expect(transitionContainer.innerHTML).toBe("<p>pending:idle</p>");
    expect(syncContainer.innerHTML).toBe("<p>1</p>");
    host.flushOneHostCallback();
    expect(transitionContainer.innerHTML).toBe("<p>settled:done</p>");
  });

  test("a same-root sync update does not commit transition state early", () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    let beginTransition = () => undefined;
    let increment = () => undefined;

    function App() {
      const [count, setCount] = useState(0);
      const [query, setQuery] = useState("A");
      const [pending, start] = useTransition();
      beginTransition = () => start(() => setQuery("B"));
      increment = () => setCount((value) => value + 1);
      return createElement("p", null, `${count}/${query}/${pending ? "pending" : "ready"}`);
    }

    root.render(createElement(App, null));
    beginTransition();
    expect(container.innerHTML).toBe("<p>0/A/pending</p>");

    flushSync(increment);
    expect(container.innerHTML).toBe("<p>1/A/pending</p>");

    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>1/B/ready</p>");
  });

  test("transition functional updates rebase over an intervening sync update", () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    let update = () => undefined;

    function App() {
      const [count, setCount] = useState(0);
      const [pending, start] = useTransition();
      update = () => {
        start(() => setCount((value) => value + 1));
        flushSync(() => setCount((value) => value + 1));
      };
      return createElement("p", null, `${pending ? "pending" : "settled"}:${count}`);
    }

    root.render(createElement(App, null));
    update();
    expect(container.innerHTML).toBe("<p>pending:1</p>");

    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>settled:2</p>");
  });

  test("two useTransition scopes on one root commit together without dropping work", () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    let update = () => undefined;

    function App() {
      const [left, setLeft] = useState("A");
      const [right, setRight] = useState("X");
      const [pending, start] = useTransition();
      update = () => {
        start(() => setLeft("B"));
        start(() => setRight("Y"));
      };
      return createElement("p", null, `${pending ? "pending" : "settled"}:${left}/${right}`);
    }

    root.render(createElement(App, null));
    update();
    expect(container.innerHTML).toBe("<p>pending:A/X</p>");

    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>settled:B/Y</p>");
  });

  test("a later transition assignment wins over an earlier sync assignment", () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    let update = () => undefined;

    function App() {
      const [value, setValue] = useState("idle");
      const [pending, start] = useTransition();
      update = () => {
        flushSync(() => setValue("fast"));
        start(() => setValue("slow"));
      };
      return createElement("p", null, `${pending ? "pending" : "settled"}:${value}`);
    }

    root.render(createElement(App, null));
    update();
    expect(container.innerHTML).toBe("<p>pending:fast</p>");

    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>settled:slow</p>");
  });

  test("a ref-scheduled sync assignment commits before a later transition assignment", () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    let scheduled = false;

    function App() {
      const [count, setCount] = useState(0);
      return createElement(
        "button",
        {
          ref: (node: HTMLButtonElement | null) => {
            if (node === null || scheduled) {
              return;
            }
            scheduled = true;
            setCount(1);
            startTransition(() => setCount(0));
          },
        },
        count,
      );
    }

    root.render(createElement(App, null));
    expect(container.innerHTML).toBe("<button>1</button>");

    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<button>0</button>");
  });

  test("an optimistic update from an attached ref survives commit-time rerendering", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let attached = false;
    let rerender = () => undefined;
    let renders = 0;
    const renderedOptimistic: string[][] = [];
    const base: string[] = [];

    function App() {
      renders += 1;
      const [count, setCount] = useState(0);
      const [optimistic, addOptimistic] = useOptimistic<string[], string>(base,
        (state, value) => [...state, value]
      );
      renderedOptimistic.push(optimistic);
      rerender = () => setCount((previous) => previous + 1);
      return createElement("button", {
        ref: (node: HTMLButtonElement | null) => {
          if (node !== null && !attached) {
            attached = true;
            addOptimistic("mounted");
          }
        },
      }, `${count}:${optimistic.join(",")}`);
    }

    root.render(createElement(App, null));
    expect(renders).toBe(2);
    expect(renderedOptimistic).toEqual([[], ["mounted"]]);
    expect(container.innerHTML).toBe("<button>0:mounted</button>");

    rerender();
    return Promise.resolve().then(() => {
      expect(container.innerHTML).toBe("<button>1:mounted</button>");
    });
  });

  test("an optimistic update appended by an attached ref survives draft publication", () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const action = createDeferred<void>();
    const base: string[] = [];
    let attached = false;
    let launch = () => undefined;

    function App() {
      const [showButton, setShowButton] = useState(false);
      const [optimistic, addOptimistic] = useOptimistic<string[], string>(base,
        (state, value) => [...state, value]
      );
      const [, start] = useTransition();
      launch = () => start(() => {
        addOptimistic("first");
        setShowButton(true);
        return action.promise;
      });
      if (!showButton) {
        return createElement("p", null, optimistic.join(","));
      }
      return createElement("button", {
        ref: (node: HTMLButtonElement | null) => {
          if (node !== null && !attached) {
            attached = true;
            addOptimistic("second");
          }
        },
      }, optimistic.join(","));
    }

    root.render(createElement(App, null));
    launch();
    expect(container.innerHTML).toBe("<p>first</p>");

    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<button>first,second</button>");
  });

  test("useOptimistic reverts when an async transition handles a rejection", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const action = createDeferred<void>();
    let launch = () => undefined;

    function App() {
      const [optimistic, addOptimistic] = useOptimistic(
        "hello",
        (state, value: string) => `${state},${value}`,
      );
      const [pending, start] = useTransition();
      launch = () =>
        start(() => {
          addOptimistic("sending");
          return action.promise.catch(() => undefined);
        });
      return createElement("p", null, `${pending ? "pending" : "settled"}:${optimistic}`);
    }

    root.render(
      createErrorBoundary(
        { fallback: (error) => createElement("strong", null, error.message) },
        createElement(App, null),
      ),
    );
    launch();
    expect(container.innerHTML).toBe("<p>pending:hello,sending</p>");

    action.reject(new Error("offline"));
    await Promise.resolve();
    await Promise.resolve();
    host.flushOneHostCallback();

    expect(container.innerHTML).toBe("<p>settled:hello</p>");
  });

  test("useOptimistic settles after its transition scope throws synchronously", () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    let launch = () => undefined;

    function App() {
      const [optimistic, addOptimistic] = useOptimistic("base", (_state, value: string) => value);
      const [pending, start] = useTransition();
      launch = () => start(() => {
        addOptimistic("temp");
        throw new Error("scope boom");
      });
      return createElement("p", null, `${pending ? "pending" : "settled"}:${optimistic}`);
    }

    root.render(
      createErrorBoundary(
        { fallback: (error) => createElement("strong", null, error.message) },
        createElement(App, null),
      ),
    );
    expect(launch).not.toThrow();
    expect(container.innerHTML).toBe("<p>pending:temp</p>");

    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<strong>scope boom</strong>");
    while (host.pendingHostCallbackCount() > 0) {
      host.flushOneHostCallback();
    }
  });

  test("useTransition reports a scope thenable whose registration throws", () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const brokenThenable = {
      then() {
        throw new Error("scope then boom");
      },
    } as PromiseLike<void>;
    let launch = () => undefined;

    function App() {
      const [optimistic, addOptimistic] = useOptimistic("base", (_state, value: string) => value);
      const [pending, start] = useTransition();
      launch = () => start(() => {
        addOptimistic("temp");
        return brokenThenable;
      });
      return createElement("p", null, `${pending ? "pending" : "settled"}:${optimistic}`);
    }

    root.render(
      createErrorBoundary(
        { fallback: (error) => createElement("strong", null, error.message) },
        createElement(App, null),
      ),
    );
    launch();
    expect(container.innerHTML).toBe("<p>pending:temp</p>");

    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<strong>scope then boom</strong>");
    while (host.pendingHostCallbackCount() > 0) {
      host.flushOneHostCallback();
    }
  });

  test("useTransition reports a scope thenable whose then getter throws", () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const brokenThenable = Object.defineProperty({}, "then", {
      get() {
        throw new Error("scope getter boom");
      },
    }) as PromiseLike<void>;
    let launch = () => undefined;

    function App() {
      const [optimistic, addOptimistic] = useOptimistic("base", (_state, value: string) => value);
      const [pending, start] = useTransition();
      launch = () => start(() => {
        addOptimistic("temp");
        return brokenThenable;
      });
      return createElement("p", null, `${pending ? "pending" : "settled"}:${optimistic}`);
    }

    root.render(
      createErrorBoundary(
        { fallback: (error) => createElement("strong", null, error.message) },
        createElement(App, null),
      ),
    );
    expect(launch).not.toThrow();
    expect(container.innerHTML).toBe("<p>pending:temp</p>");

    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<strong>scope getter boom</strong>");
    while (host.pendingHostCallbackCount() > 0) {
      host.flushOneHostCallback();
    }
  });

  test("useActionState reports an action thenable whose registration throws", () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const brokenThenable = {
      then() {
        throw new Error("action then boom");
      },
    } as PromiseLike<string>;
    let launch = () => undefined;

    function App() {
      const [base, dispatch, actionPending] = useActionState(
        () => brokenThenable,
        "base",
      );
      const [optimistic, addOptimistic] = useOptimistic(base, (_state, value: string) => value);
      const [transitionPending, start] = useTransition();
      launch = () => start(() => {
        addOptimistic("temp");
        dispatch(undefined);
      });
      return createElement("p", null, `${transitionPending}:${actionPending}:${optimistic}`);
    }

    root.render(
      createErrorBoundary(
        { fallback: (error) => createElement("strong", null, error.message) },
        createElement(App, null),
      ),
    );
    launch();
    expect(container.innerHTML).toBe("<strong>action then boom</strong>");
    while (host.pendingHostCallbackCount() > 0) {
      host.flushOneHostCallback();
    }
  });

  test("useActionState reports an action thenable whose then getter throws", () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const brokenThenable = Object.defineProperty({}, "then", {
      get() {
        throw new Error("action getter boom");
      },
    }) as PromiseLike<string>;
    let launch = () => undefined;

    function App() {
      const [base, dispatch, actionPending] = useActionState(
        () => brokenThenable,
        "base",
      );
      const [optimistic, addOptimistic] = useOptimistic(base, (_state, value: string) => value);
      const [transitionPending, start] = useTransition();
      launch = () => start(() => {
        addOptimistic("temp");
        dispatch(undefined);
      });
      return createElement("p", null, `${transitionPending}:${actionPending}:${optimistic}`);
    }

    root.render(
      createErrorBoundary(
        { fallback: (error) => createElement("strong", null, error.message) },
        createElement(App, null),
      ),
    );
    launch();
    expect(container.innerHTML).toBe("<strong>action getter boom</strong>");
    while (host.pendingHostCallbackCount() > 0) {
      host.flushOneHostCallback();
    }
  });

  test("an optimistic sync commit waits until its transition scope returns", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const action = createDeferred<void>();
    const calls: string[] = [];
    const base: string[] = [];
    let attached = false;
    let launch = () => undefined;

    function App() {
      const [refState, setRefState] = useState(false);
      const [optimistic, addOptimistic] = useOptimistic<string[], string>(base,
        (state, value) => [...state, value]
      );
      launch = () => startTransition(() => {
        calls.push("before");
        addOptimistic("scope");
        calls.push("after");
        return action.promise;
      });
      if (optimistic.includes("scope")) {
        return createElement("button", {
          ref: (node: HTMLButtonElement | null) => {
            if (node !== null && !attached) {
              attached = true;
              calls.push("ref");
              addOptimistic("ref");
              setRefState(true);
            }
          },
        }, `${optimistic.join(",")}:${refState}`);
      }
      return createElement("p", null, `${refState}:${optimistic.join(",")}`);
    }

    root.render(createElement(App, null));
    launch();

    expect(calls).toEqual(["before", "after", "ref"]);
    expect(container.innerHTML).toBe("<button>scope,ref:true</button>");

    action.resolve();
    await Promise.resolve();
    await Promise.resolve();
    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>true:</p>");
  });

  test("a synchronous useActionState action remains pending until its transition commits", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    let launch = () => undefined;

    function App() {
      const [count, dispatch, actionPending] = useActionState(
        (previous: number) => previous + 1,
        0,
      );
      const [transitionPending, start] = useTransition();
      launch = () => start(() => dispatch(undefined));
      return createElement("p", null, `${transitionPending}:${actionPending}:${count}`);
    }

    root.render(createElement(App, null));
    expect(container.innerHTML).toBe("<p>false:false:0</p>");

    launch();
    expect(container.innerHTML).toBe("<p>true:true:0</p>");

    await Promise.resolve();
    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>false:false:1</p>");
  });

  test("useOptimistic settles when its raw async transition scope rejects", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const action = createDeferred<void>();
    let launch = () => undefined;

    function App() {
      const [optimistic, addOptimistic] = useOptimistic("base", (_state, value: string) => value);
      const [pending, start] = useTransition();
      launch = () => start(() => {
        addOptimistic("temp");
        return action.promise;
      });
      return createElement("p", null, `${pending ? "pending" : "settled"}:${optimistic}`);
    }

    root.render(
      createErrorBoundary(
        { fallback: (error) => createElement("strong", null, error.message) },
        createElement(App, null),
      ),
    );
    launch();
    expect(container.innerHTML).toBe("<p>pending:temp</p>");

    action.reject(new Error("action boom"));
    await Promise.resolve();
    await Promise.resolve();
    host.flushOneHostCallback();

    expect(container.innerHTML).toBe("<strong>action boom</strong>");
    while (host.pendingHostCallbackCount() > 0) {
      host.flushOneHostCallback();
    }
  });

  test("useOptimistic reverts when an async transition commits the same base state", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const action = createDeferred<void>();
    let launch = () => undefined;

    function App() {
      const [base, setBase] = useState("hello");
      const [optimistic, addOptimistic] = useOptimistic(
        base,
        (state, value: string) => `${state},${value}`,
      );
      const [pending, start] = useTransition();
      launch = () =>
        start(() => {
          addOptimistic("sending");
          return action.promise.then(() => {
            startTransition(() => setBase("hello"));
          });
        });
      return createElement("p", null, `${pending ? "pending" : "settled"}:${optimistic}`);
    }

    root.render(createElement(App, null));
    launch();
    expect(container.innerHTML).toBe("<p>pending:hello,sending</p>");

    action.resolve();
    await Promise.resolve();
    await Promise.resolve();
    host.flushOneHostCallback();

    expect(container.innerHTML).toBe("<p>settled:hello</p>");
  });

  test("useOptimistic replaces a settled entry with the new base state", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const action = createDeferred<string>();
    let launch = () => undefined;

    function App() {
      const [base, setBase] = useState("hello");
      const [optimistic, addOptimistic] = useOptimistic(
        base,
        (state, value: string) => `${state},${value}`,
      );
      const [pending, start] = useTransition();
      launch = () =>
        start(() => {
          addOptimistic("sending");
          return action.promise.then((nextBase) => {
            startTransition(() => setBase(nextBase));
          });
        });
      return createElement("p", null, `${pending ? "pending" : "settled"}:${optimistic}`);
    }

    root.render(createElement(App, null));
    launch();
    expect(container.innerHTML).toBe("<p>pending:hello,sending</p>");

    action.resolve("hello,sent");
    await Promise.resolve();
    await Promise.resolve();
    host.flushOneHostCallback();

    expect(container.innerHTML).toBe("<p>settled:hello,sent</p>");
  });

  test("concurrent optimistic entries settle independently", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const first = createDeferred<void>();
    const second = createDeferred<void>();
    let launch: (label: string, action: Promise<void>) => void = () => {};

    function App() {
      const [optimistic, addOptimistic] = useOptimistic<string[], string>([], (state, value) => [
        ...state,
        value,
      ]);
      const [pending, start] = useTransition();
      launch = (label, action) =>
        start(() => {
          addOptimistic(label);
          return action;
        });
      return createElement("p", null, `${pending ? "pending" : "settled"}:${optimistic.join(",")}`);
    }

    root.render(createElement(App, null));
    launch("A", first.promise);
    launch("B", second.promise);
    expect(container.innerHTML).toBe("<p>pending:A,B</p>");

    second.resolve();
    await Promise.resolve();
    await Promise.resolve();
    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>pending:A</p>");

    first.resolve();
    await Promise.resolve();
    await Promise.resolve();
    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>settled:</p>");
  });

  test("a committed base rebases an independently pending optimistic entry", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const first = createDeferred<string[]>();
    const second = createDeferred<void>();
    let launchFirst = () => undefined;
    let launchSecond = () => undefined;

    function App() {
      const [base, setBase] = useState(["base"]);
      const [optimistic, addOptimistic] = useOptimistic<string[], string>(base,
        (state, value) => [...state, `${value}:sending`]
      );
      const [pending, start] = useTransition();
      launchFirst = () => start(() => {
        addOptimistic("A");
        return first.promise.then((nextBase) => {
          startTransition(() => setBase(nextBase));
        });
      });
      launchSecond = () => start(() => {
        addOptimistic("B");
        return second.promise;
      });
      return createElement(
        "p",
        null,
        `${pending ? "pending" : "settled"}:${optimistic.join(",")}`,
      );
    }

    root.render(createElement(App, null));
    launchFirst();
    launchSecond();
    expect(container.innerHTML).toBe("<p>pending:base,A:sending,B:sending</p>");

    first.resolve(["base", "A:sent"]);
    await Promise.resolve();
    await Promise.resolve();
    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>pending:base,A:sent,B:sending</p>");

    second.resolve();
    await Promise.resolve();
    await Promise.resolve();
    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>settled:base,A:sent</p>");
  });

  test("useOptimistic follows the lifecycle of useActionState work", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const action = createDeferred<string>();
    let launch = () => undefined;

    function App() {
      const [base, dispatch, actionPending] = useActionState(
        (_previous: string, _payload: undefined) => action.promise,
        "hello",
      );
      const [optimistic, addOptimistic] = useOptimistic(
        base,
        (state, value: string) => `${state},${value}`,
      );
      const [transitionPending, start] = useTransition();
      launch = () =>
        start(() => {
          addOptimistic("sending");
          dispatch(undefined);
        });
      return createElement("p", null, `${transitionPending}:${actionPending}:${optimistic}`);
    }

    root.render(createElement(App, null));
    launch();
    expect(container.innerHTML).toBe("<p>true:true:hello,sending</p>");

    action.resolve("hello");
    await Promise.resolve();
    await Promise.resolve();
    host.flushOneHostCallback();

    expect(container.innerHTML).toBe("<p>false:false:hello</p>");
  });

  test("queued useActionState work receives the preceding result while optimistic entries settle", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const first = createDeferred<string[]>();
    const second = createDeferred<string[]>();
    const calls: string[] = [];
    let launch: (label: "A" | "B") => void = () => {};

    function App() {
      const [base, dispatch, actionPending] = useActionState(
        (previous: string[], label: "A" | "B") => {
          calls.push(`${label}:${previous.join(",")}`);
          return label === "A" ? first.promise : second.promise;
        },
        ["base"],
      );
      const [optimistic, addOptimistic] = useOptimistic<string[], string>(base,
        (state, value) => [...state, `${value}:sending`]
      );
      const [firstPending, startFirst] = useTransition();
      const [secondPending, startSecond] = useTransition();
      launch = (label) => (label === "A" ? startFirst : startSecond)(() => {
        addOptimistic(label);
        dispatch(label);
      });
      return createElement(
        "p",
        null,
        `${firstPending}:${secondPending}:${actionPending}:${optimistic.join(",")}`,
      );
    }

    root.render(createElement(App, null));
    launch("A");
    launch("B");
    expect(container.innerHTML).toBe("<p>true:true:true:base,A:sending,B:sending</p>");
    expect(calls).toEqual(["A:base"]);

    first.resolve(["base", "A:sent"]);
    await Promise.resolve();
    await Promise.resolve();
    host.flushOneHostCallback();
    expect(calls).toEqual(["A:base", "B:base,A:sent"]);
    expect(container.innerHTML).toBe("<p>false:true:true:base,A:sent,B:sending</p>");

    second.resolve(["base", "A:sent", "B:sent"]);
    await Promise.resolve();
    await Promise.resolve();
    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>false:false:false:base,A:sent,B:sent</p>");
  });

  test("a failed queued action cancels later work and releases its transition", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const first = createDeferred<string[]>();
    const calls: string[] = [];
    let launch: (label: "A" | "B") => void = () => {};

    function App() {
      const [base, dispatch] = useActionState(
        (previous: string[], label: "A" | "B") => {
          calls.push(`${label}:${previous.join(",")}`);
          return first.promise;
        },
        ["base"],
      );
      const [optimistic, addOptimistic] = useOptimistic<string[], string>(base,
        (state, value) => [...state, value]
      );
      const [, startFirst] = useTransition();
      const [, startSecond] = useTransition();
      launch = (label) => (label === "A" ? startFirst : startSecond)(() => {
        addOptimistic(label);
        dispatch(label);
      });
      return createElement("p", null, optimistic.join(","));
    }

    root.render(
      createErrorBoundary(
        { fallback: (error) => createElement("strong", null, error.message) },
        createElement(App, null),
      ),
    );
    launch("A");
    launch("B");
    expect(calls).toEqual(["A:base"]);
    expect(container.innerHTML).toBe("<p>base,A,B</p>");

    first.reject(new Error("A failed"));
    await Promise.resolve();
    await Promise.resolve();
    host.flushOneHostCallback();

    expect(calls).toEqual(["A:base"]);
    expect(container.innerHTML).toBe("<strong>A failed</strong>");
    while (host.pendingHostCallbackCount() > 0) {
      host.flushOneHostCallback();
    }
  });

  test("unmounting cancels queued action work without starting it later", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const first = createDeferred<string>();
    const calls: string[] = [];
    let launch: (label: "A" | "B") => void = () => {};

    function App() {
      const [, dispatch] = useActionState(
        (previous: string, label: "A" | "B") => {
          calls.push(`${label}:${previous}`);
          return first.promise;
        },
        "base",
      );
      const [, startFirst] = useTransition();
      const [, startSecond] = useTransition();
      launch = (label) => (label === "A" ? startFirst : startSecond)(() => {
        dispatch(label);
      });
      return createElement("p", null, "mounted");
    }

    root.render(createElement(App, null));
    launch("A");
    launch("B");
    expect(calls).toEqual(["A:base"]);

    root.unmount();
    first.resolve("A:done");
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toEqual(["A:base"]);
    expect(container.innerHTML).toBe("");
    expect(host.pendingHostCallbackCount()).toBe(0);
  });

  test("an intervening sync render preserves active optimistic entries", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const action = createDeferred<void>();
    let launch = () => undefined;
    let bump = () => undefined;

    function App() {
      const [count, setCount] = useState(0);
      const [optimistic, addOptimistic] = useOptimistic<string[], string>([], (state, value) => [
        ...state,
        value,
      ]);
      const [pending, start] = useTransition();
      launch = () =>
        start(() => {
          addOptimistic("A");
          return action.promise;
        });
      bump = () => flushSync(() => setCount((previous) => previous + 1));
      return createElement(
        "p",
        null,
        `${pending ? "pending" : "settled"}:${count}:${optimistic.join(",")}`,
      );
    }

    root.render(createElement(App, null));
    launch();
    bump();
    expect(container.innerHTML).toBe("<p>pending:1:A</p>");

    action.resolve();
    await Promise.resolve();
    await Promise.resolve();
    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>settled:1:</p>");
  });

  test("settling optimistic work after unmount does not schedule a render", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const action = createDeferred<void>();
    let launch = () => undefined;

    function App() {
      const [optimistic, addOptimistic] = useOptimistic("base", (_state, value: string) => value);
      const [, start] = useTransition();
      launch = () =>
        start(() => {
          addOptimistic("pending");
          return action.promise;
        });
      return createElement("p", null, optimistic);
    }

    root.render(createElement(App, null));
    launch();
    expect(container.innerHTML).toBe("<p>pending</p>");

    root.unmount();
    expect(host.pendingHostCallbackCount()).toBe(0);
    action.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(container.innerHTML).toBe("");
    expect(host.pendingHostCallbackCount()).toBe(0);
  });

  test("a torn transition render retries a functional update exactly once", () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    let tear = false;
    let reads = 0;
    let update = () => undefined;
    let binding: { get(): unknown } | undefined;
    const bindingValuesDuringRender: unknown[] = [];
    const reactiveStateBindingMeta = Symbol.for("modular.react.reactive_state_binding_meta");

    function getSnapshot() {
      if (!tear) {
        return 0;
      }
      reads += 1;
      if (reads === 2) {
        return 1;
      }
      if (reads > 2) {
        tear = false;
      }
      return 0;
    }

    function App() {
      const state = useState(0) as unknown as [
        number,
        (value: number | ((previous: number) => number)) => void,
      ] &
        Record<PropertyKey, unknown>;
      const [count, setCount] = state;
      binding = state[reactiveStateBindingMeta] as { get(): unknown };
      bindingValuesDuringRender.push(binding.get());
      const snapshot = useSyncExternalStore(() => () => undefined, getSnapshot);
      const [pending, start] = useTransition();
      update = () =>
        start(() => {
          tear = true;
          reads = 0;
          setCount((value) => value + 1);
        });
      return createElement("p", null, `${pending ? "pending" : "settled"}:${count}:${snapshot}`);
    }

    root.render(createElement(App, null));
    update();
    expect(container.innerHTML).toBe("<p>pending:0:0</p>");

    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>settled:1:0</p>");
    expect(reads).toBeGreaterThan(2);
    expect(bindingValuesDuringRender.every((value) => value === 0)).toBe(true);
    expect(binding?.get()).toBe(1);
  });

  test("a torn optimistic settlement render retains independently pending entries", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    const first = createDeferred<void>();
    const second = createDeferred<void>();
    let tear = false;
    let reads = 0;
    let launch: (label: string, action: Promise<void>) => void = () => {};

    function getSnapshot() {
      if (!tear) {
        return 0;
      }
      reads += 1;
      if (reads === 2) {
        return 1;
      }
      if (reads > 2) {
        tear = false;
      }
      return 0;
    }

    function App() {
      const snapshot = useSyncExternalStore(() => () => undefined, getSnapshot);
      const [optimistic, addOptimistic] = useOptimistic<string[], string>([],
        (state, value) => [...state, value]
      );
      const [pending, start] = useTransition();
      launch = (label, action) => start(() => {
        addOptimistic(label);
        return action;
      });
      return createElement(
        "p",
        null,
        `${pending ? "pending" : "settled"}:${optimistic.join(",")}:${snapshot}`,
      );
    }

    root.render(createElement(App, null));
    launch("A", first.promise);
    launch("B", second.promise);
    expect(container.innerHTML).toBe("<p>pending:A,B:0</p>");

    tear = true;
    reads = 0;
    first.resolve();
    await Promise.resolve();
    await Promise.resolve();
    host.flushOneHostCallback();

    expect(container.innerHTML).toBe("<p>pending:B:0</p>");
    expect(reads).toBeGreaterThan(2);
  });

  test("useDeferredValue keeps the previous value until the transition lane commits", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    let setValue: (value: string) => void = () => {};

    function App() {
      const [value, updateValue] = useState("A");
      const deferred = useDeferredValue(value);
      setValue = updateValue;

      return createElement("p", null, `${value}:${deferred}`);
    }

    root.render(createElement(App, null));
    expect(container.innerHTML).toBe("<p>A:A</p>");

    setValue("B");
    expect(container.innerHTML).toBe("<p>B:A</p>");

    await Promise.resolve();
    expect(container.innerHTML).toBe("<p>B:A</p>");

    host.flushOneHostCallback();
    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>B:B</p>");
  });

  test("useDeferredValue returns initialValue on the first render", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);

    function App() {
      const deferred = useDeferredValue("real", "initial");
      return createElement("p", null, deferred);
    }

    root.render(createElement(App, null));
    expect(container.innerHTML).toBe("<p>initial</p>");

    await Promise.resolve();
    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>real</p>");
  });

  test("does not run effects from a suspended primary subtree", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const effects: string[] = [];
    let ready = false;
    let resolvePromise: () => void = () => {};
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    function EffectSibling() {
      useEffect(() => {
        effects.push("effect");
      }, []);
      return createElement("span", null, "sibling");
    }

    function AsyncChild() {
      if (!ready) {
        throw promise;
      }
      return createElement("strong", null, "ready");
    }

    root.render(
      createElement(
        Suspense,
        { fallback: createElement("em", null, "loading") },
        createElement(EffectSibling, null),
        createElement(AsyncChild, null),
      ),
    );

    expect(container.innerHTML).toBe("<em>loading</em>");
    expect(effects).toEqual([]);

    ready = true;
    resolvePromise();
    await promise;
    await Promise.resolve();

    expect(container.innerHTML).toBe("<span>sibling</span><strong>ready</strong>");
    expect(effects).toEqual(["effect"]);
  });

  test("transition state updates commit on the transition lane after scope execution", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    let transitionToSlow: () => void = () => {};

    function App() {
      const [value, setValue] = useState("idle");
      transitionToSlow = () => {
        startTransition(() => {
          setValue("slow");
        });
      };

      return createElement("p", null, value);
    }

    root.render(createElement(App, null));
    transitionToSlow();
    expect(container.innerHTML).toBe("<p>idle</p>");

    await Promise.resolve();
    expect(container.innerHTML).toBe("<p>idle</p>");

    host.flushOneHostCallback();
    expect(container.innerHTML).toBe("<p>slow</p>");
  });

  test("hydrateRoot reuses existing Suspense fallback while promise is pending", () => {
    const container = document.createElement("div");
    container.innerHTML = "<em>loading</em>";
    const fallback = container.firstChild;
    const pending = new Promise<void>(() => {});

    function AsyncChild() {
      throw pending;
    }

    hydrateRoot(
      container,
      createElement(
        Suspense,
        { fallback: createElement("em", null, "loading") },
        createElement(AsyncChild, null),
      ),
    );

    expect(container.firstChild).toBe(fallback);
    expect(container.innerHTML).toBe("<em>loading</em>");
  });

  test("SuspenseList revealOrder forwards stops after the first pending boundary", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const pending = new Promise<void>(() => {});

    function Pending() {
      throw pending;
    }

    root.render(
      createElement(SuspenseList, { revealOrder: "forwards" }, [
        createElement(
          Suspense,
          { fallback: createElement("em", null, "loading") },
          createElement(Pending, null),
        ),
        createElement(Suspense, { fallback: null }, createElement("strong", null, "later")),
      ]),
    );

    expect(container.innerHTML).toBe("<em>loading</em>");
  });

  test("SuspenseList revealOrder forwards stops at pending null fallbacks", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const pending = new Promise<void>(() => {});

    function Pending() {
      throw pending;
    }

    root.render(
      createElement(SuspenseList, { revealOrder: "forwards" }, [
        createElement(Suspense, { fallback: null }, createElement(Pending, null)),
        createElement("strong", null, "later"),
      ]),
    );

    expect(container.innerHTML).toBe("");
  });

  test("SuspenseList revealOrder backwards stops at the last pending boundary", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const pending = new Promise<void>(() => {});

    function Pending() {
      throw pending;
    }

    root.render(
      createElement(SuspenseList, { revealOrder: "backwards" }, [
        createElement(Suspense, { fallback: null }, createElement("strong", null, "first")),
        createElement(
          Suspense,
          { fallback: createElement("em", null, "loading") },
          createElement(Pending, null),
        ),
      ]),
    );

    expect(container.innerHTML).toBe("<em>loading</em>");
  });

  test("SuspenseList revealOrder together keeps later ready children visible", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const pending = new Promise<void>(() => {});

    function Pending() {
      throw pending;
    }

    root.render(
      createElement(SuspenseList, { revealOrder: "together" }, [
        createElement(
          Suspense,
          { fallback: createElement("em", null, "loading") },
          createElement(Pending, null),
        ),
        createElement(Suspense, { fallback: null }, createElement("strong", null, "later")),
      ]),
    );

    expect(container.innerHTML).toBe("<em>loading</em><strong>later</strong>");
  });

  test("createErrorBoundary catches thrown errors without catching promises", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const errors: string[] = [];

    function Broken() {
      throw new Error("boom");
    }

    root.render(
      createErrorBoundary(
        {
          fallback: (error) => createElement("strong", null, error.message),
          onError: (error) => {
            errors.push(error.message);
          },
        },
        createElement(Broken, null),
      ),
    );

    expect(container.innerHTML).toBe("<strong>boom</strong>");
    expect(errors).toEqual(["boom"]);
  });

  test("class ErrorBoundary catches descendant errors and renders derived state", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const errors: string[] = [];

    function Broken() {
      throw new Error("boom");
    }

    class Boundary {
      props: { children: unknown };
      state = { message: "" };

      constructor(props: { children: unknown }) {
        this.props = props;
      }

      static getDerivedStateFromError(error: Error) {
        return { message: error.message };
      }

      componentDidCatch(error: Error, info: { componentStack: string }) {
        errors.push(`${error.message}:${info.componentStack}`);
      }

      render() {
        if (this.state.message !== "") {
          return createElement("strong", null, this.state.message);
        }

        return this.props.children;
      }
    }

    root.render(createElement(Boundary, null, createElement(Broken, null)));

    expect(container.innerHTML).toBe("<strong>boom</strong>");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("boom:");
    expect(errors[0]).toContain("Boundary");
  });

  test("sync updates abort stale transition commits", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");
    const root = createRoot(container);
    let transitionToSlow: () => void = () => {};
    let syncToFast: () => void = () => {};

    function App() {
      const [value, setValue] = useState("idle");
      const [pending, start] = useTransition();
      transitionToSlow = () => {
        start(() => {
          setValue("slow");
        });
      };
      syncToFast = () => {
        setValue("fast");
      };

      return createElement("p", null, `${pending ? "pending" : "settled"}:${value}`);
    }

    root.render(createElement(App, null));
    transitionToSlow();
    expect(container.innerHTML).toBe("<p>pending:idle</p>");
    syncToFast();
    expect(container.innerHTML).toBe("<p>pending:fast</p>");
    await Promise.resolve();
    host.flushOneHostCallback();
    host.flushOneHostCallback();

    expect(container.innerHTML).toBe("<p>settled:fast</p>");
  });

  test("startTransition scopes run synchronously even when newer transitions are scheduled", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const calls: string[] = [];

    startTransition(() => {
      calls.push("first");
    });
    startTransition(() => {
      calls.push("second");
    });

    await Promise.resolve();
    expect(calls).toEqual(["first", "second"]);
    host.flushOneHostCallback();
    host.flushOneHostCallback();

    expect(calls).toEqual(["first", "second"]);
  });
});
