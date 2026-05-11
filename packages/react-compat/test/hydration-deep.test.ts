// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import {
  createElement,
  enableEventHydrationManifestReplay,
  enableHydrationEventReplay,
  hydrateRoot,
  queueHydrationEvent,
  readEventHydrationManifest,
  Suspense,
} from "../src/index.js";
import { getFiberRootForContainer } from "../src/fiber-work-loop.js";

describe("react-compat deep hydration", () => {
  test("reports and recovers text, attribute, and tag mismatches", () => {
    const container = document.createElement("div");
    container.innerHTML = '<span id="server">server</span>';
    const recoveries: string[] = [];

    hydrateRoot(
      container,
      createElement("p", { id: "client" }, "client"),
      {
        onRecoverableError(error, info) {
          recoveries.push(`${info.kind}:${info.path}:${error.message}`);
        },
      },
    );

    expect(container.innerHTML).toBe('<p id="client">client</p>');
    expect(recoveries).toEqual(expect.arrayContaining([
      "tag:0:Hydration tag mismatch: expected <p> but found <span>.",
      "attribute:0:Hydration attribute mismatch: id.",
      "text:0.c:Hydration text mismatch.",
    ]));
  });

  test("reports and recovers style mismatches", () => {
    const container = document.createElement("div");
    container.innerHTML = '<p style="color: red; font-size: 12px;">server</p>';
    const recoveries: string[] = [];

    hydrateRoot(
      container,
      createElement("p", { style: { color: "blue" } }, "server"),
      {
        onRecoverableError(error, info) {
          recoveries.push(`${info.kind}:${info.path}:${error.message}`);
        },
      },
    );

    const paragraph = container.querySelector("p");
    expect(paragraph?.style.color).toBe("blue");
    expect(paragraph?.style.fontSize).toBe("");
    expect(recoveries).toContain(
      "attribute:0:Hydration attribute mismatch: style.",
    );
  });

  test("reports and recovers boolean attribute mismatches", () => {
    const container = document.createElement("div");
    container.innerHTML = "<button>Save</button>";
    const recoveries: string[] = [];

    hydrateRoot(
      container,
      createElement("button", { disabled: true }, "Save"),
      {
        onRecoverableError(error, info) {
          recoveries.push(`${info.kind}:${info.path}:${error.message}`);
        },
      },
    );

    const button = container.querySelector("button");
    expect(button?.disabled).toBe(true);
    expect(button?.hasAttribute("disabled")).toBe(true);
    expect(recoveries).toContain(
      "attribute:0:Hydration attribute mismatch: disabled.",
    );
  });

  test("maps htmlFor to the for attribute during hydration recovery", () => {
    const container = document.createElement("div");
    container.innerHTML = '<label for="server">Name</label>';
    const recoveries: string[] = [];

    hydrateRoot(
      container,
      createElement("label", { htmlFor: "client" }, "Name"),
      {
        onRecoverableError(error, info) {
          recoveries.push(`${info.kind}:${info.path}:${error.message}`);
        },
      },
    );

    const label = container.querySelector("label");
    expect(label?.getAttribute("for")).toBe("client");
    expect(label?.hasAttribute("htmlFor")).toBe(false);
    expect(recoveries).toContain(
      "attribute:0:Hydration attribute mismatch: for.",
    );
  });

  test("reports and removes extra server child nodes during hydration", () => {
    const container = document.createElement("div");
    container.innerHTML = "<div><span>extra</span></div>";
    const recoveries: string[] = [];

    hydrateRoot(container, createElement("div", null), {
      onRecoverableError(error, info) {
        recoveries.push(`${info.kind}:${info.path}:${error.message}`);
      },
    });

    expect(container.innerHTML).toBe("<div></div>");
    expect(recoveries).toContain(
      "node:0.c:Hydration extra node mismatch.",
    );
  });

  test("replays queued click events after handler attachment", () => {
    const container = document.createElement("div");
    container.innerHTML = "<button>Save</button>";
    const button = container.querySelector("button");
    let clicks = 0;

    if (button === null) {
      throw new Error("Expected server button.");
    }

    queueHydrationEvent(container, new MouseEvent("click", { bubbles: true }), button);
    hydrateRoot(
      container,
      createElement("button", { onClick: () => { clicks += 1; } }, "Save"),
    );

    expect(clicks).toBe(1);
  });

  test("captures replayable browser events before hydration", () => {
    const container = document.createElement("div");
    container.innerHTML = "<button>Save</button>";
    const button = container.querySelector("button");
    let clicks = 0;

    if (button === null) {
      throw new Error("Expected server button.");
    }

    const disposeReplayCapture = enableHydrationEventReplay(container);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    hydrateRoot(
      container,
      createElement("button", { onClick: () => { clicks += 1; } }, "Save"),
    );
    disposeReplayCapture();

    expect(clicks).toBe(1);
  });

  test("captured replay events do not reach pre-hydration listeners", () => {
    const container = document.createElement("div");
    container.innerHTML = "<button>Save</button>";
    const button = container.querySelector("button");
    let preHydrationClicks = 0;
    let hydratedClicks = 0;

    if (button === null) {
      throw new Error("Expected server button.");
    }

    const preHydrationListener = () => {
      preHydrationClicks += 1;
    };
    button.addEventListener("click", preHydrationListener);

    const disposeReplayCapture = enableHydrationEventReplay(container);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.removeEventListener("click", preHydrationListener);

    hydrateRoot(
      container,
      createElement("button", { onClick: () => { hydratedClicks += 1; } }, "Save"),
    );
    disposeReplayCapture();

    expect(preHydrationClicks).toBe(0);
    expect(hydratedClicks).toBe(1);
  });

  test("captures only events listed in the server event hydration manifest", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<button>Save</button><input value="server"><script type="application/json" data-mreact-event-manifest>{"version":1,"events":[{"id":"App:0","event":"click","handler":"onClick"}]}</script>';
    const button = container.querySelector("button");
    const input = container.querySelector("input");
    let preHydrationClicks = 0;
    let preHydrationInputs = 0;
    let hydratedClicks = 0;

    if (button === null || input === null) {
      throw new Error("Expected server controls.");
    }

    const preHydrationClickListener = () => {
      preHydrationClicks += 1;
    };
    button.addEventListener("click", preHydrationClickListener);
    input.addEventListener("input", () => {
      preHydrationInputs += 1;
    });

    const manifest = readEventHydrationManifest(container);
    const disposeReplayCapture = enableEventHydrationManifestReplay(
      container,
      manifest,
    );
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    button.removeEventListener("click", preHydrationClickListener);

    hydrateRoot(
      container,
      [
        createElement("button", { onClick: () => { hydratedClicks += 1; } }, "Save"),
        createElement("input", { value: "client" }),
      ],
    );
    disposeReplayCapture();

    expect(preHydrationClicks).toBe(0);
    expect(preHydrationInputs).toBe(1);
    expect(hydratedClicks).toBe(1);
  });

  test("uses resume boundary markers as hydration scope", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<span>outside</span><!--mreact-h:start:app--><button>server</button><!--mreact-h:end:app-->';
    const outside = container.querySelector("span");
    const serverButton = container.querySelector("button");

    hydrateRoot(
      container,
      createElement("button", null, "client"),
      { resumeId: "app" },
    );

    expect(container.querySelector("span")).toBe(outside);
    expect(container.querySelector("button")).toBe(serverButton);
    expect(container.innerHTML).toBe(
      '<span>outside</span><!--mreact-h:start:app--><button>client</button><!--mreact-h:end:app-->',
    );

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.hydrationState?.resumeId).toBe("app");
    expect(fiberRoot?.current.child?.tag).toBe("host-component");
  });

  test("reuses keyed list DOM nodes inside resume hydration scope and replays events", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<!--mreact-h:start:catalog--><div><ul><li>A <button>add</button></li><li>B <button>add</button></li></ul><p>in cart: 0</p></div><!--mreact-h:end:catalog-->';
    const beforeItems = Array.from(container.querySelectorAll("li"));
    const beforeButtons = Array.from(container.querySelectorAll("button"));
    let clicks = 0;

    const catalog = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];

    if (beforeButtons[0] === undefined) {
      throw new Error("Expected server button.");
    }

    queueHydrationEvent(
      container,
      new MouseEvent("click", { bubbles: true }),
      beforeButtons[0],
    );
    hydrateRoot(
      container,
      createElement(
        "div",
        null,
        createElement(
          "ul",
          null,
          catalog.map((item) =>
            createElement(
              "li",
              { key: item.id },
              item.name,
              " ",
              createElement("button", { onClick: () => { clicks += 1; } }, "add"),
            ),
          ),
        ),
        createElement("p", null, "in cart: ", clicks),
      ),
      { resumeId: "catalog" },
    );

    Array.from(container.querySelectorAll("li")).forEach((item, index) => {
      expect(item).toBe(beforeItems[index]);
    });
    Array.from(container.querySelectorAll("button")).forEach((button, index) => {
      expect(button).toBe(beforeButtons[index]);
    });
    expect(clicks).toBe(1);
  });

  test("can consume resume boundary markers after hydration", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<span>outside</span><!--mreact-h:start:app--><button>server</button><!--mreact-h:end:app-->';

    hydrateRoot(
      container,
      createElement("button", null, "client"),
      { resumeId: "app", consumeResumeMarkers: true },
    );

    expect(container.innerHTML).toBe(
      "<span>outside</span><button>client</button>",
    );
  });

  test("keeps resume boundary scope when a hydrated Suspense boundary retries", async () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<span>outside</span><!--mreact-h:start:app--><em>loading</em><!--mreact-h:end:app-->';
    const outside = container.querySelector("span");
    let ready = false;
    let resolvePromise: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    function AsyncChild() {
      if (!ready) {
        throw pending;
      }

      return createElement("strong", null, "ready");
    }

    hydrateRoot(
      container,
      createElement(
        Suspense,
        { fallback: createElement("em", null, "loading") },
        createElement(AsyncChild, null),
      ),
      { resumeId: "app" },
    );

    expect(container.querySelector("span")).toBe(outside);
    expect(container.innerHTML).toBe(
      '<span>outside</span><!--mreact-h:start:app--><em>loading</em><!--mreact-h:end:app-->',
    );

    ready = true;
    resolvePromise();
    await pending;
    await Promise.resolve();

    expect(container.querySelector("span")).toBe(outside);
    expect(container.innerHTML).toBe(
      '<span>outside</span><!--mreact-h:start:app--><strong>ready</strong><!--mreact-h:end:app-->',
    );
  });

  test("hydrates and consumes completed React Suspense comment markers", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--$--><span>ready</span><!--/$-->";
    const serverSpan = container.querySelector("span");

    hydrateRoot(
      container,
      createElement(
        Suspense,
        { fallback: createElement("em", null, "loading") },
        createElement("span", null, "ready"),
      ),
    );

    expect(container.querySelector("span")).toBe(serverSpan);
    expect(container.innerHTML).toBe("<span>ready</span>");

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.finishedWork).toBeUndefined();
    expect(fiberRoot?.workInProgress).toBeUndefined();
    expect(fiberRoot?.current.child?.tag).toBe("suspense");
    expect(fiberRoot?.current.child?.memoizedState).toEqual({
      didSuspend: false,
    });
  });

  test("hydrates and consumes pending React Suspense fallback markers", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<!--$?--><template id="B:0"></template><em>loading</em><!--/$-->';
    const serverFallback = container.querySelector("em");
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

    expect(container.querySelector("em")).toBe(serverFallback);
    expect(container.innerHTML).toBe("<em>loading</em>");

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.finishedWork).toBeUndefined();
    expect(fiberRoot?.workInProgress).toBeUndefined();
    expect(fiberRoot?.current.child?.tag).toBe("suspense");
    expect(fiberRoot?.current.child?.memoizedState).toEqual({
      didSuspend: true,
    });
  });

  test("keeps DOM outside React Suspense markers when pending boundary retries", async () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<span>outside</span><!--$?--><template id="B:0"></template><em>loading</em><!--/$-->';
    const outside = container.querySelector("span");
    const fallback = container.querySelector("em");
    let ready = false;
    let resolvePromise: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    function AsyncChild() {
      if (!ready) {
        throw pending;
      }

      return createElement("strong", null, "ready");
    }

    hydrateRoot(
      container,
      [
        createElement("span", null, "outside"),
        createElement(
          Suspense,
          { fallback: createElement("em", null, "loading") },
          createElement(AsyncChild, null),
        ),
      ],
    );

    expect(container.querySelector("span")).toBe(outside);
    expect(container.querySelector("em")).toBe(fallback);
    expect(container.innerHTML).toBe("<span>outside</span><em>loading</em>");

    ready = true;
    resolvePromise();
    await pending;
    await Promise.resolve();

    expect(container.querySelector("span")).toBe(outside);
    expect(container.innerHTML).toBe("<span>outside</span><strong>ready</strong>");
  });
});
