import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildClientRouteEntrySource,
  buildClientRouteOutput,
  collectClientRouteReferences,
} from "../src/client.js";

async function createRouteProject(
  files: Readonly<Record<string, string>>,
): Promise<{ appDir: string; routeFile: string }> {
  const appDir = await mkdtemp(join(tmpdir(), "mreact-route-capabilities-"));

  for (const [file, content] of Object.entries(files)) {
    const target = join(appDir, file);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, content);
  }

  return { appDir, routeFile: join(appDir, "page.mreact.tsx") };
}

async function buildRoute(files: Readonly<Record<string, string>>): Promise<string> {
  const project = await createRouteProject(files);
  const code = files["page.mreact.tsx"] ?? "";
  const output = await buildClientRouteOutput({
    code,
    filename: project.routeFile,
    routePath: "/",
  });

  return output.code;
}

/**
 * The generated entry before bundling. Import aliases such as `__mreactWithCleanupScope` only exist
 * here; the bundler rewrites them to the imported function's own name.
 */
async function buildRouteEntry(files: Readonly<Record<string, string>>): Promise<string> {
  const project = await createRouteProject(files);
  const entry = await buildClientRouteEntrySource({
    code: files["page.mreact.tsx"] ?? "",
    filename: project.routeFile,
    routePath: "/",
  });

  return entry.code;
}

const childCounter = `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}
`;

describe("client route capability facts", () => {
  test("leaves an interactive imported child to its own client reference boundary", async () => {
    const files = {
      "Counter.tsx": childCounter,
      "page.mreact.tsx": `import { Counter } from "./Counter.js";
export const clientNavigation = false;

export default function Page() {
  return <main><Counter /></main>;
}`,
    };
    const project = await createRouteProject(files);
    const references = await collectClientRouteReferences({
      code: files["page.mreact.tsx"],
      filename: project.routeFile,
      routePath: "/",
    });
    const code = await buildRoute(files);

    // The child is promoted to its own reference bundle and hydrates there, so the route entry must
    // not take on route state restoration for cells it never renders.
    expect(references.clientReferenceManifest.map((entry) => entry.name)).toEqual(["Counter"]);
    expect(code).not.toContain("__mreactRouteStates");
    expect(code).not.toContain("__mreactActiveCellRecords");
  });

  test("keeps route state restoration for a route that owns its cells", async () => {
    const code = await buildRoute({
      "page.mreact.tsx": `import { cell } from "@reckona/mreact-reactive-core";
export const clientNavigation = false;

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
    });

    expect(code).toContain("__mreactRouteStates");
    expect(code).toContain("__mreactRouteStateSignature");
  });

  test("omits route state restoration for a route whose reachable graph never calls cell", async () => {
    const code = await buildRoute({
      "Label.tsx": `export function Label(props: { text: string }) {
  return <span>{props.text}</span>;
}
`,
      "page.mreact.tsx": `import { Label } from "./Label.js";
export const clientNavigation = false;

export default function Page() {
  return <main><Label text="ready" /><button type="button" onClick={() => document.title = "x"}>Go</button></main>;
}`,
    });

    expect(code).not.toContain("__mreactRouteStates");
    expect(code).not.toContain("__mreactActiveCellRecords");
  });

  test("does not take on a cleanup scope for an imported child's reactive effect", async () => {
    const code = await buildRouteEntry({
      "Title.tsx": `import { cell, effect } from "@reckona/mreact-reactive-core";

export function Title() {
  const value = cell("ready");
  effect(() => { document.title = value.get(); });
  return <h1>{value.get()}</h1>;
}
`,
      "page.mreact.tsx": `import { Title } from "./Title.js";
export const clientNavigation = false;

export default function Page() {
  return <main><Title /></main>;
}`,
    });

    // The child owns its own effect lifetime inside its boundary bundle.
    expect(code).not.toContain("__mreactRouteEffect");
  });

  test("keeps the cleanup scope for a route that registers its own reactive effect", async () => {
    const code = await buildRouteEntry({
      "page.mreact.tsx": `import { cell, effect } from "@reckona/mreact-reactive-core";
export const clientNavigation = false;

export default function Page() {
  const value = cell("ready");
  effect(() => { document.title = value.get(); });
  return <button type="button" onClick={() => value.set("clicked")}>{value.get()}</button>;
}`,
    });

    expect(code).toContain("__mreactWithCleanupScope");
    expect(code).toContain("__mreactRouteEffect");
  });

  test("keeps dom ref binding for a route that compiles a domRef attribute", async () => {
    const code = await buildRouteEntry({
      "page.mreact.tsx": `export const clientNavigation = false;

export default function Page() {
  return <main domRef={(element) => {
    element.setAttribute("data-observed", "true");
    return () => element.removeAttribute("data-observed");
  }}>Observed</main>;
}`,
    });

    // The compiler lowers the attribute into a bindDomRef call the source never wrote, so compiled
    // evidence has to win over a source graph that reports the capability unused.
    expect(code).toContain("__mreactGetDomRefBindings");
    expect(code).toContain("__mreactSyncDomRefBindings");
  });

  test("leaves route state off when an unknown graph carries no compiled cell evidence", async () => {
    const code = await buildRoute({
      "panel.tsx": `export function Panel() {
  return <aside>panel</aside>;
}
`,
      "page.mreact.tsx": `export const clientNavigation = false;

const loadPanel = () => import("./panel.js");

export default function Page() {
  return <button type="button" onClick={() => void loadPanel()}>Load</button>;
}`,
    });

    // `unknown` falls back to the compiled-output signal, and that signal says no cells here.
    expect(code).not.toContain("__mreactRouteStates");
    expect(code).not.toContain("__mreactActiveCellRecords");
  });

  test("does not bind dom refs for a child boundary that calls bindDomRef", async () => {
    const code = await buildRouteEntry({
      "Focus.tsx": `import { cell } from "@reckona/mreact-reactive-core";
import { bindDomRef } from "@reckona/mreact-reactive-dom";

export function Focus() {
  const node = cell(null);
  return <div ref={bindDomRef(node)}><button type="button" onClick={() => node.get()?.focus()}>Focus</button></div>;
}
`,
      "page.mreact.tsx": `import { Focus } from "./Focus.js";
export const clientNavigation = false;

export default function Page() {
  return <main><Focus /></main>;
}`,
    });

    expect(code).not.toContain("__mreactGetDomRefBindings");
  });

  test("does not restore the request url because a comment mentions the request", async () => {
    const code = await buildRoute({
      "page.mreact.tsx": `export const clientNavigation = false;

// This route never reads the request object.
export default function Page() {
  const label = "request";
  return <button type="button" onClick={() => document.title = label}>Go</button>;
}`,
    });

    // A word in a comment or a string literal is not a capability.
    expect(code).not.toContain("__mreactRouteUrl");
  });

  test("restores the request url when the route reads it from its props", async () => {
    const code = await buildRoute({
      "page.mreact.tsx": `export const clientNavigation = false;

export default function Page(props: { request: { pathname: string } }) {
  return <main>{props.request.pathname}</main>;
}`,
    });

    expect(code).toContain("__mreactRouteUrl");
  });

  test("restores the request url when an imported child reads it", async () => {
    const code = await buildRoute({
      "Path.tsx": `export function Path(props: { request: { pathname: string } }) {
  return <span>{props.request.pathname}</span>;
}
`,
      "page.mreact.tsx": `import { Path } from "./Path.js";
export const clientNavigation = false;

export default function Page(props: { request: { pathname: string } }) {
  return <main><Path request={props.request} /></main>;
}`,
    });

    expect(code).toContain("__mreactRouteUrl");
  });

  test("keeps the request url restoration when a dynamic import hides the reachable graph", async () => {
    const code = await buildRoute({
      "page.mreact.tsx": `export const clientNavigation = false;

const loadPanel = () => import("./Panel.js");

export default function Page() {
  return <button type="button" onClick={() => void loadPanel()}>Load</button>;
}`,
      "Panel.tsx": `export function Panel(props: { request: { pathname: string } }) {
  return <span>{props.request.pathname}</span>;
}
`,
    });

    expect(code).toContain("__mreactRouteUrl");
  });

  test("keeps event binding synchronisation when an unrelated static import is opaque", async () => {
    const code = await buildRouteEntry({
      "page.mreact.tsx": `import { formatLabel } from "./labels.js";
export const clientNavigation = false;

export default function Page() {
  return <button type="button" onClick={() => document.title = formatLabel("go")}>Go</button>;
}`,
      "labels.ts": `export function formatLabel(value: string): string {
  return value.toUpperCase();
}
`,
    });

    expect(code).toContain("__mreactBindCapturedEvent");
  });

  test("does not force event synchronisation for a static import that renders nothing", async () => {
    const code = await buildRouteEntry({
      "constants.ts": `export const greeting = "hello";
`,
      "page.mreact.tsx": `import { greeting } from "./constants.js";
export const clientNavigation = false;

export default function Page() {
  return <main>{greeting}</main>;
}`,
    });

    // The old heuristic forced event capture for any route with a static import at all.
    expect(code).not.toContain("__mreactBindCapturedEvent");
  });

  test("resolves capabilities through an import cycle without looping", async () => {
    const code = await buildRoute({
      "a.tsx": `import { B } from "./b.js";
import { cell } from "@reckona/mreact-reactive-core";

export function A() {
  const count = cell(0);
  return <span onClick={() => count.set((value) => value + 1)}>{count.get()}<B /></span>;
}
`,
      "b.tsx": `import { A } from "./a.js";

export function B() {
  return <em>{typeof A === "function" ? "cycle" : "none"}</em>;
}
`,
      "page.mreact.tsx": `import { A } from "./a.js";
export const clientNavigation = false;

export default function Page() {
  return <main><A /></main>;
}`,
    });

    // Termination is what matters here: the cycle must not hang, and the interactive child still
    // hydrates through its own boundary rather than through the route entry.
    expect(code).toContain("__mreactHydrateRoute");
    expect(code).not.toContain("__mreactRouteStates");
  });

  test("does not adopt capabilities from a .client boundary module", async () => {
    const code = await buildRoute({
      "Island.client.tsx": childCounter.replace("Counter", "Island"),
      "page.mreact.tsx": `import { Island } from "./Island.client.js";
export const clientNavigation = false;

export default function Page() {
  return <main><Island /></main>;
}`,
    });

    expect(code).not.toContain("__mreactRouteStates");
  });

  test("keeps the compiled cell hint when a dynamic import leaves the graph unknown", async () => {
    const code = await buildRoute({
      "panel.tsx": `export function Panel() {
  return <aside>panel</aside>;
}
`,
      "page.mreact.tsx": `import { cell } from "@reckona/mreact-reactive-core";
export const clientNavigation = false;

const loadPanel = () => import("./panel.js");

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => { void loadPanel(); count.set((value) => value + 1); }}>{count.get()}</button>;
}`,
    });

    // An unresolved graph must not silence evidence the compiled route module already carries.
    expect(code).toContain("__mreactRouteStates");
  });

  test("does not treat a shadowed local cell binding as reactive route state", async () => {
    const code = await buildRoute({
      "page.mreact.tsx": `export const clientNavigation = false;

function render(cell: (value: string) => string) {
  return cell("shadowed");
}

export default function Page() {
  return <button type="button" onClick={() => document.title = render((value) => value)}>Go</button>;
}`,
    });

    expect(code).not.toContain("__mreactRouteStates");
  });
});
