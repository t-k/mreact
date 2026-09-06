import * as React from "react";
import { renderToString as renderReactToString } from "react-dom/server";
import { createElement as createCompatElement } from "@reckona/mreact-compat";
import { describe, expect, test } from "vitest";
import { renderToString as renderMreactToString } from "../src/server.js";

describe("react-dom/server differential corpus", () => {
  test("matches React DOM server output for basic host markup", () => {
    const cases = [
      {
        mreact: createCompatElement("p", null, "Ada & Grace"),
        react: React.createElement("p", null, "Ada & Grace"),
      },
      {
        mreact: createCompatElement("button", { disabled: true }, "Save"),
        react: React.createElement("button", { disabled: true }, "Save"),
      },
      {
        mreact: createCompatElement("div", {
          "aria-hidden": false,
          "data-ready": false,
          style: { zIndex: 2, opacity: 0.5, "--gap": "1rem" },
        }),
        react: React.createElement("div", {
          "aria-hidden": false,
          "data-ready": false,
          style: { zIndex: 2, opacity: 0.5, "--gap": "1rem" },
        }),
      },
    ];

    for (const testCase of cases) {
      expect(renderMreactToString(testCase.mreact)).toBe(renderReactToString(testCase.react));
    }
  });

  test("matches React DOM server output for select value selection", () => {
    const STATUSES = ["open", "in_progress", "done"];
    const noop = (): void => {};

    // Each case is built twice from the same shape, once per createElement, so
    // React DOM itself pins the boundary semantics: precedence, string
    // comparison, array values, and which options carry `selected`.
    const shapes: { name: string; build: (h: typeof React.createElement) => unknown }[] = [
      {
        name: "options from a map",
        build: (h) =>
          h(
            "select",
            { value: "in_progress", onChange: noop },
            STATUSES.map((status) => h("option", { key: status, value: status }, status)),
          ),
      },
      {
        name: "nested arrays, fragments, optgroups and child components",
        build: (h) => {
          const StatusOption = (props: { status: string }): unknown =>
            h("option", { value: props.status }, props.status);
          return h(
            "select",
            { value: "done", onChange: noop },
            [[h("option", { key: "open", value: "open" }, "open")]],
            h(React.Fragment, { key: "f" }, h("option", { value: "in_progress" }, "in_progress")),
            h(
              "optgroup",
              { key: "g", label: "closed" },
              h(StatusOption as never, { status: "done" }),
            ),
          );
        },
      },
      {
        name: "value beats defaultValue and a stale option selected",
        build: (h) =>
          h(
            "select",
            { value: "done", defaultValue: "open", onChange: noop },
            h("option", { key: "a", value: "open", selected: true }, "open"),
            h("option", { key: "b", value: "done" }, "done"),
          ),
      },
      {
        name: "undefined value falls back to defaultValue",
        build: (h) =>
          h(
            "select",
            { value: undefined, defaultValue: "done" },
            h("option", { key: "a", value: "open" }, "open"),
            h("option", { key: "b", value: "done" }, "done"),
          ),
      },
      {
        name: "no selection leaves the option's own selected in charge",
        build: (h) =>
          h(
            "select",
            null,
            h("option", { key: "a", value: "open" }, "open"),
            h("option", { key: "b", value: "done", selected: true }, "done"),
          ),
      },
      {
        name: "number value compares as a string",
        build: (h) =>
          h(
            "select",
            { value: 2, onChange: noop },
            h("option", { key: "a", value: 1 }, "one"),
            h("option", { key: "b", value: 2 }, "two"),
          ),
      },
      {
        name: "empty string value",
        build: (h) =>
          h(
            "select",
            { value: "", onChange: noop },
            h("option", { key: "a", value: "" }, "none"),
            h("option", { key: "b", value: "open" }, "open"),
          ),
      },
      {
        name: "option without a value attribute uses its text",
        build: (h) =>
          h(
            "select",
            { value: "done", onChange: noop },
            h("option", { key: "a" }, "open"),
            h("option", { key: "b" }, "done"),
          ),
      },
      {
        name: "null value marks nothing",
        build: (h) =>
          h(
            "select",
            { value: null, onChange: noop },
            h("option", { key: "a", value: "open" }, "open"),
            h("option", { key: "b", value: "done" }, "done"),
          ),
      },
      {
        name: "non-matching value marks nothing",
        build: (h) =>
          h(
            "select",
            { value: "missing", onChange: noop },
            h("option", { key: "a", value: "open" }, "open"),
            h("option", { key: "b", value: "done" }, "done"),
          ),
      },
      {
        name: "duplicate option values both stay marked",
        build: (h) =>
          h(
            "select",
            { value: "open", onChange: noop },
            h("option", { key: "a", value: "open" }, "one"),
            h("option", { key: "b", value: "open" }, "two"),
          ),
      },
      {
        name: "a disabled option is still marked when it matches",
        build: (h) =>
          h(
            "select",
            { value: "done", onChange: noop },
            h("option", { key: "a", value: "open" }, "open"),
            h("option", { key: "b", value: "done", disabled: true }, "done"),
          ),
      },
      {
        name: "multiple with an array value marks every match",
        build: (h) =>
          h(
            "select",
            { multiple: true, value: ["open", "done"], onChange: noop },
            STATUSES.map((status) => h("option", { key: status, value: status }, status)),
          ),
      },
      {
        name: "multiple with an empty array marks nothing",
        build: (h) =>
          h(
            "select",
            { multiple: true, value: [], onChange: noop },
            STATUSES.map((status) => h("option", { key: status, value: status }, status)),
          ),
      },
      {
        name: "sibling selects and an option outside any select stay independent",
        build: (h) =>
          h(
            "form",
            null,
            h(
              "select",
              { key: "l", name: "left", value: "open", onChange: noop },
              STATUSES.map((status) => h("option", { key: status, value: status }, status)),
            ),
            h(
              "select",
              { key: "r", name: "right", value: "done", onChange: noop },
              STATUSES.map((status) => h("option", { key: status, value: status }, status)),
            ),
            h("option", { key: "o", value: "open" }, "outside"),
          ),
      },
      {
        name: "selected option values and labels stay escaped",
        build: (h) =>
          h(
            "select",
            { value: '<script>"&', onChange: noop },
            h("option", { key: "a", value: '<script>"&' }, '<script>"&'),
            h("option", { key: "b", value: "safe" }, "safe"),
          ),
      },
    ];

    for (const shape of shapes) {
      expect(
        renderMreactToString(shape.build(createCompatElement as never) as never),
        shape.name,
      ).toBe(renderReactToString(shape.build(React.createElement) as never));
    }
  });
});
