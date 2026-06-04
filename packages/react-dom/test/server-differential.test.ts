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
});
