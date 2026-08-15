// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  getEventPriority,
  isNonDelegatedEventName,
  toEventNames,
  toEventPropNames,
} from "../src/host-event-binder.js";

describe("host event binder", () => {
  test("normalizes React prop names to delegated native events", () => {
    expect(toEventNames("onClick")).toEqual(["click"]);
    expect(toEventNames("onDoubleClick")).toEqual(["dblclick"]);
    expect(toEventNames("onClickCapture")).toEqual(["click"]);
    expect(toEventNames("onChange")).toEqual(["change", "input"]);
    expect(toEventNames("onDrag")).toEqual(["drag"]);
  });

  test("normalizes delegated native events back to React prop names", () => {
    expect(toEventPropNames("click")).toEqual(["onClick"]);
    expect(toEventPropNames("dblclick")).toEqual(["onDoubleClick"]);
    expect(toEventPropNames("focusin")).toEqual(["onFocus"]);
    expect(toEventPropNames("input")).toEqual(["onInput", "onChange"]);
    expect(toEventPropNames("drag")).toEqual(["onDrag"]);
  });

  test("classifies and normalizes every React non-delegated event", () => {
    const events = [
      ["abort", "onAbort"],
      ["beforetoggle", "onBeforeToggle"],
      ["cancel", "onCancel"],
      ["canplay", "onCanPlay"],
      ["canplaythrough", "onCanPlayThrough"],
      ["close", "onClose"],
      ["durationchange", "onDurationChange"],
      ["emptied", "onEmptied"],
      ["encrypted", "onEncrypted"],
      ["ended", "onEnded"],
      ["error", "onError"],
      ["invalid", "onInvalid"],
      ["load", "onLoad"],
      ["loadeddata", "onLoadedData"],
      ["loadedmetadata", "onLoadedMetadata"],
      ["loadstart", "onLoadStart"],
      ["pause", "onPause"],
      ["play", "onPlay"],
      ["playing", "onPlaying"],
      ["progress", "onProgress"],
      ["ratechange", "onRateChange"],
      ["resize", "onResize"],
      ["scroll", "onScroll"],
      ["scrollend", "onScrollEnd"],
      ["seeked", "onSeeked"],
      ["seeking", "onSeeking"],
      ["stalled", "onStalled"],
      ["suspend", "onSuspend"],
      ["timeupdate", "onTimeUpdate"],
      ["toggle", "onToggle"],
      ["volumechange", "onVolumeChange"],
      ["waiting", "onWaiting"],
    ] as const;

    for (const [eventName, propName] of events) {
      expect(isNonDelegatedEventName(eventName), eventName).toBe(true);
      expect(toEventNames(propName), propName).toEqual([eventName]);
      expect(toEventNames(`${propName}Capture`), `${propName}Capture`).toEqual([eventName]);
      expect(toEventPropNames(eventName), eventName).toEqual([propName]);
    }

    for (const eventName of [
      "animationend",
      "change",
      "click",
      "focusin",
      "focusout",
      "input",
      "mouseout",
      "mouseover",
      "submit",
      "wheel",
    ]) {
      expect(isNonDelegatedEventName(eventName), eventName).toBe(false);
    }
  });

  test("classifies event priority without pulling in host reconciliation", () => {
    expect(getEventPriority("click")).toBe("discrete");
    expect(getEventPriority("drag")).toBe("continuous");
    expect(getEventPriority("mousemove")).toBe("continuous");
    expect(getEventPriority("animationend")).toBe("default");
  });

  test("keeps the base drag event explicitly registered in both event maps", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/react-compat/src/events.ts"),
      "utf8",
    );

    expect(source).toContain('["onDrag", ["drag"]]');
    expect(source).toContain('["drag", ["onDrag"]]');
  });
});
