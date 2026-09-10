// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { createElement, hydrateRoot, renderToString, useId } from "../src/index.js";

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
  const container = document.createElement("main");
  container.innerHTML = renderToString(
    Parent,
    {},
    { identifierPrefix: "boundary", stringResult: "text" },
  );
  const nodes = Array.from(container.querySelectorAll("[id]"));
  const ids = nodes.map((node) => node.id);
  const errors: Error[] = [];
  const root = hydrateRoot(container, createElement(Parent), {
    identifierPrefix: "boundary",
    onRecoverableError: (error) => errors.push(error),
  });
  expect(Array.from(container.querySelectorAll("[id]"))).toEqual(nodes);
  expect(nodes.map((node) => node.id)).toEqual(ids);
  expect(errors).toEqual([]);
  root.unmount();
});
