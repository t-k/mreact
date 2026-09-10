// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { takeNavigationRouteDataScripts } from "../src/navigation-route-data.js";

test("detaches metadata intact while preserving unrelated shell nodes", () => {
  const template = document.createElement("template");
  template.innerHTML =
    '<section><main>Page</main><script id="props" type="application/json">{"count":7}</script><script id="refs" type="application/json">[]</script><script type="module" src="/page.js"></script></section>';
  const original = template.content.getElementById("props");
  const result = takeNavigationRouteDataScripts(template.content, ["props", "refs", "missing"]);
  expect([...result.keys()]).toEqual(["props", "refs", "missing"]);
  expect(result.get("props")).toBe(original);
  expect(result.get("props")?.textContent).toBe('{"count":7}');
  expect(result.get("refs")?.textContent).toBe("[]");
  expect(result.get("missing")).toBeNull();
  expect(template.content.getElementById("props")).toBeNull();
  expect(template.content.getElementById("refs")).toBeNull();
  expect(result.get("props")?.parentNode).toBeNull();
  expect(template.content.querySelector("main")?.textContent).toBe("Page");
  expect(template.content.querySelector('script[type="module"]')?.getAttribute("src")).toBe(
    "/page.js",
  );
});

test("does not change the fragment when no route metadata IDs are requested", () => {
  const template = document.createElement("template");
  template.innerHTML = '<script id="props" type="application/json">{}</script>';
  expect(takeNavigationRouteDataScripts(template.content, []).size).toBe(0);
  expect(template.content.getElementById("props")?.textContent).toBe("{}");
});
