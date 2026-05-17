import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  clientScriptForPath,
  detectClientNavigationHint,
  hydrationMarkerParts,
  inferClientRouteModule,
  isClientRouteSource,
  routeToClientManifestEntry,
  routeIdForPath,
  withHydrationMarkers,
  withRouteMarkers,
} from "../src/client.js";

describe("router client helpers", () => {
  test("isClientRouteSource detects event handlers and reactive cells", () => {
    expect(isClientRouteSource(`<button onClick={() => {}}>x</button>`)).toBe(true);
    expect(isClientRouteSource(`const x = cell(0);`)).toBe(true);
    expect(isClientRouteSource(`if (window.scrollY > 0) {}`)).toBe(true);
    expect(isClientRouteSource(`document.title = "t";`)).toBe(true);
    expect(isClientRouteSource(`localStorage.getItem("k");`)).toBe(true);
  });

  test("isClientRouteSource returns false for purely server-rendered sources", () => {
    expect(isClientRouteSource(`export default function Page() { return <p>hi</p>; }`)).toBe(false);
  });

  test("isClientRouteSource ignores markers that appear only in comments or strings", () => {
    expect(
      isClientRouteSource(`// refresh window mentions document and localStorage
const label = "cell(0) and onClick= are prose";
const template = \`window document cell(1)\`;
export default function Page() {
  return <p>{label}{template}</p>;
}`),
    ).toBe(false);
  });

  test("isClientRouteSource ignores markers that appear only in TypeScript types", () => {
    expect(
      isClientRouteSource(`type BrowserNames = window | document | localStorage;
export default function Page() {
  return <p>typed only</p>;
}`),
    ).toBe(false);
  });

  test("isClientRouteSource detects JSX event handlers through the OXC AST", () => {
    expect(
      isClientRouteSource(`export default function Page() {
  return <button
    onClick={() => undefined}
  >Save</button>;
}`),
    ).toBe(true);
  });

  test("routeToClientManifestEntry detects route-local imported interactive components", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-imported-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "Counter.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>count: {count.get()}</button>;
}`,
    );
    await writeFile(
      pageFile,
      `import { Counter } from "./Counter";

export default function Page() {
  return <Counter />;
}`,
    );

    const entry = await routeToClientManifestEntry({
      file: pageFile,
      kind: "page",
      path: "/imported-counter",
      segments: [{ kind: "static", value: "imported-counter" }],
    });

    expect(entry.client).toBe(true);
    expect(entry.script).toBe("routes/imported-counter.js");
  });

  test("inferClientRouteModule returns direct inferred boundary imports", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-boundary-imports-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "Counter.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
    );
    const code = `import { Counter } from "./Counter";

export default function Page() {
  return <Counter />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/counter",
      }),
    ).resolves.toEqual({
      client: true,
      clientBoundaryImports: ["./Counter"],
    });
  });

  test("inferClientRouteModule ignores unused interactive imports", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-unused-import-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "Counter.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
    );
    const code = `import { Counter } from "./Counter";

export default function Page() {
  return <main>Server only</main>;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/unused",
      }),
    ).resolves.toEqual({
      client: false,
      clientBoundaryImports: [],
    });
  });

  test("routeToClientManifestEntry keeps server-safe imported components server-only", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-imported-safe-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "Title.tsx"),
      `export function Title() {
  return <h1>Dashboard</h1>;
}`,
    );
    await writeFile(
      pageFile,
      `import { Title } from "./Title";

export default function Page() {
  return <Title />;
}`,
    );

    const entry = await routeToClientManifestEntry({
      file: pageFile,
      kind: "page",
      path: "/safe",
      segments: [{ kind: "static", value: "safe" }],
    });

    expect(entry).toEqual({ path: "/safe", kind: "page", client: false });
  });

  test("routeToClientManifestEntry resolves TypeScript modules imported with .js suffix", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-imported-js-suffix-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "actions.ts"),
      `export async function save() {
  "use server";
}`,
    );
    await writeFile(
      pageFile,
      `import { save } from "./actions.js";

export default function Page() {
  return <form action={save}><button type="submit">Save</button></form>;
}`,
    );

    const entry = await routeToClientManifestEntry({
      file: pageFile,
      kind: "page",
      path: "/actions",
      segments: [{ kind: "static", value: "actions" }],
    });

    expect(entry).toEqual({ path: "/actions", kind: "page", client: false });
  });

  test("routeToClientManifestEntry follows recursive imports and tolerates cycles", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-imported-cycle-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "A.tsx"),
      `import { B } from "./B";
export function A() {
  return <B />;
}`,
    );
    await writeFile(
      join(appDir, "B.tsx"),
      `import { A } from "./A";
export function B() {
  return <button type="button" onClick={() => undefined}>Click</button>;
}
export const Cycle = A;`,
    );
    await writeFile(
      pageFile,
      `import { A } from "./A";
export default function Page() {
  return <A />;
}`,
    );

    const entry = await routeToClientManifestEntry({
      file: pageFile,
      kind: "page",
      path: "/cycle",
      segments: [{ kind: "static", value: "cycle" }],
    });

    expect(entry.client).toBe(true);
  });

  test("routeIdForPath maps `/` to index and replaces unsafe chars with underscores", () => {
    expect(routeIdForPath("/")).toBe("index");
    expect(routeIdForPath("/users/:id")).toBe("users__id");
    expect(routeIdForPath("/a-b")).toBe("a-b");
  });

  test("clientScriptForPath references the route id", () => {
    expect(clientScriptForPath("/")).toBe("routes/index.js");
    expect(clientScriptForPath("/users/:id")).toBe("routes/users__id.js");
  });

  test("hydrationMarkerParts emits a div wrapper, JSON props, and a script src", () => {
    const { prefix, suffix } = hydrationMarkerParts({
      props: { id: 1, "&quot": "<x>" },
      routePath: "/users/:id",
    });
    expect(prefix).toContain('data-mreact-route-id="users__id"');
    expect(suffix).toContain('<script type="application/json" id="mreact-props-users__id">');
    expect(suffix).toContain("\\u003cx>");
    expect(suffix).toContain("/_mreact/client/routes/users__id.js");
  });

  test("hydrationMarkerParts honors an explicit script option", () => {
    const { suffix } = hydrationMarkerParts({
      props: {},
      routePath: "/",
      script: "custom/path.js",
    });
    expect(suffix).toContain('src="/_mreact/client/custom/path.js"');
  });

  test("withRouteMarkers wraps html with just a data-mreact-route-id div", () => {
    expect(withRouteMarkers({ html: "<p>x</p>", routePath: "/a" })).toBe(
      '<div data-mreact-route-id="a"><p>x</p></div>',
    );
  });

  test("withHydrationMarkers wraps html, props, and the script tag", () => {
    const result = withHydrationMarkers({
      html: "<p>x</p>",
      props: { ok: true },
      routePath: "/test",
    });
    expect(result).toContain('data-mreact-route-id="test"');
    expect(result).toContain("<p>x</p>");
    expect(result).toContain('"ok":true');
  });

  test("detectClientNavigationHint returns true when there is no hint", () => {
    expect(detectClientNavigationHint("export default function Page() {}")).toBe(true);
  });

  test("detectClientNavigationHint reads `export const clientNavigation = false`", () => {
    expect(detectClientNavigationHint("export const clientNavigation = false")).toBe(false);
    expect(detectClientNavigationHint("export const clientNavigation = true")).toBe(true);
  });

  test("detectClientNavigationHint tolerates a type annotation and whitespace variants", () => {
    expect(detectClientNavigationHint("export const  clientNavigation : boolean = false ;")).toBe(
      false,
    );
  });
});
