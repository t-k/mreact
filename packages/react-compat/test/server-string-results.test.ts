import { expect, test } from "vitest";
import { createElement, renderToString, useId } from "../src/index.js";

const payload = '<img src=x onerror="alert(1)">&text';

test("ReactNode string results escape once while legacy compiled HTML remains unchanged", () => {
  const escaped = "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;text";
  expect(renderToString(() => payload, {}, { stringResult: "text" })).toBe(escaped);
  expect(renderToString(() => [payload], {}, { stringResult: "text" })).toBe(escaped);
  expect(renderToString(() => "&lt;", {}, { stringResult: "text" })).toBe("&amp;lt;");
  expect(renderToString(() => "<b>compiled</b>")).toBe("<b>compiled</b>");
});

test("text mode preserves component hook paths and nested element rendering", () => {
  function Child() {
    return createElement("span", { id: useId() }, payload);
  }
  function Parent() {
    return createElement("section", { id: useId() }, createElement(Child));
  }
  expect(renderToString(Parent, {}, { identifierPrefix: "boundary", stringResult: "text" })).toBe(
    renderToString(Parent, {}, { identifierPrefix: "boundary" }),
  );
});
