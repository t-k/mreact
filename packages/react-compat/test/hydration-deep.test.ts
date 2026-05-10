// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import {
  createElement,
  enableHydrationEventReplay,
  hydrateRoot,
  queueHydrationEvent,
} from "../src/index.js";

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
  });
});
