// @vitest-environment happy-dom

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

describe("react-compat Radix UI dialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  test("dispatches click handlers once through the aliased react-dom client", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onClick = vi.fn();

    root.render(React.createElement("button", { onClick }, "Open"));
    container
      .querySelector("button")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(onClick).toHaveBeenCalledTimes(1);

    root.unmount();
  });

  test("opens and closes a real Radix dialog from its trigger", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onTriggerClick = vi.fn();
    const triggerProps = {
      "data-testid": "open-dialog",
      onClick: onTriggerClick,
    };
    const contentProps = { "aria-label": "Dialog", "data-testid": "dialog-content" };
    const closeProps = { "data-testid": "close-dialog", type: "button" as const };

    function RadixDialog() {
      return React.createElement(
        Dialog.Root,
        null,
        React.createElement(Dialog.Trigger, triggerProps, "Open dialog"),
        React.createElement(
          Dialog.Portal,
          null,
          React.createElement(
            Dialog.Content,
            contentProps,
            React.createElement(Dialog.Title, null, "Radix dialog"),
            React.createElement(Dialog.Description, null, "Body"),
            React.createElement(Dialog.Close, closeProps, "Close"),
          ),
        ),
      );
    }

    root.render(React.createElement(RadixDialog, null));

    const trigger = container.querySelector<HTMLButtonElement>("[data-testid='open-dialog']");
    trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(onTriggerClick).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector("[data-testid='dialog-content']")).not.toBeNull();

    document.body
      .querySelector<HTMLButtonElement>("[data-testid='close-dialog']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(document.body.querySelector("[data-testid='dialog-content']")).toBeNull();

    root.unmount();
  });
});
