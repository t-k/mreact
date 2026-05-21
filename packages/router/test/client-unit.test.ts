import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  clientScriptForPath,
  createClientRouteInferenceCache,
  detectClientNavigationHint,
  hydrationMarkerParts,
  inferClientRouteModule,
  isClientRouteSource,
  routeToClientManifestEntry,
  routeIdForPath,
  withHydrationMarkers,
  withRouteMarkers,
} from "../src/client.js";
import { stripRouteClientOnlyExports } from "../src/route-source.js";

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
    ).resolves.toMatchObject({
      client: true,
      clientBoundaryImports: ["./Counter"],
      diagnostics: [],
    });
  });

  test("inferClientRouteModule only treats the rendered export as a client boundary", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-export-granularity-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "components.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Title() {
  return <h1>Server title</h1>;
}

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
    );
    const code = `import { Title } from "./components";

export default function Page() {
  return <Title />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/title",
      }),
    ).resolves.toMatchObject({
      client: false,
      clientBoundaryImports: [],
      diagnostics: [],
    });
  });

  test("inferClientRouteModule supports explicit use client modules", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-use-client-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "ClientTitle.tsx"),
      `"use client";

export function ClientTitle() {
  return <h1>Client title</h1>;
}`,
    );
    const code = `import { ClientTitle } from "./ClientTitle";

export default function Page() {
  return <ClientTitle />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/client-title",
      }),
    ).resolves.toMatchObject({
      client: true,
      clientBoundaryImports: ["./ClientTitle"],
      diagnostics: [],
    });
  });

  test("inferClientRouteModule warns instead of auto-clientizing server-only components", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-server-only-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "ServerCounter.tsx"),
      `"use server";
import { cell } from "@reckona/mreact-reactive-core";

export function ServerCounter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
    );
    const code = `import { ServerCounter } from "./ServerCounter";

export default function Page() {
  return <ServerCounter />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/server-counter",
      }),
    ).resolves.toMatchObject({
      client: false,
      clientBoundaryImports: [],
      diagnostics: [
        expect.objectContaining({
          code: "MR_CLIENT_BOUNDARY_INFERENCE_SERVER_ONLY_REFERENCE",
          level: "warn",
          source: "./ServerCounter",
        }),
      ],
    });
  });

  test("inferClientRouteModule treats unprefixed Node builtins as server-only imports", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-node-builtin-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "ServerCounter.tsx"),
      `import { readFile } from "fs/promises";
import { cell } from "@reckona/mreact-reactive-core";

export function ServerCounter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
    );
    const code = `import { ServerCounter } from "./ServerCounter";

export default function Page() {
  return <ServerCounter />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/server-counter",
      }),
    ).resolves.toMatchObject({
      client: false,
      clientBoundaryImports: [],
      diagnostics: [
        expect.objectContaining({
          code: "MR_CLIENT_BOUNDARY_INFERENCE_SERVER_ONLY_REFERENCE",
          level: "warn",
          source: "./ServerCounter",
        }),
      ],
    });
  });

  test("inferClientRouteModule still finds nested client boundaries through server-only wrappers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-server-only-wrapper-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "ClientCounter.client.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function ClientCounter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
    );
    await writeFile(
      join(appDir, "Header.tsx"),
      `import { readFileSync } from "node:fs";
import { ClientCounter } from "./ClientCounter.client";

export function Header() {
  const title = readFileSync("/tmp/title", "utf8");
  return <header><h1>{title}</h1><ClientCounter /></header>;
}`,
    );
    const code = `import { Header } from "./Header";

export default function Page() {
  return <Header />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/server-wrapper",
      }),
    ).resolves.toMatchObject({
      client: true,
      clientBoundaryImports: [],
      diagnostics: [],
    });
  });

  test("inferClientRouteModule follows barrel re-exports for rendered client components", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-barrel-imports-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "Counter.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
    );
    await writeFile(join(appDir, "components.ts"), `export { Counter } from "./Counter";`);
    const code = `import { Counter } from "./components";

export default function Page() {
  return <Counter />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/barrel",
      }),
    ).resolves.toMatchObject({
      client: true,
      clientBoundaryImports: ["./components"],
      diagnostics: [],
    });
  });

  test("inferClientRouteModule follows simple aliases for rendered client components", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-alias-imports-"));
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

const InteractiveCounter = Counter;

export default function Page() {
  return <InteractiveCounter />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/alias",
      }),
    ).resolves.toMatchObject({
      client: true,
      clientBoundaryImports: ["./Counter"],
      diagnostics: [],
    });
  });

  test("inferClientRouteModule follows lowercase JSX member roots for namespace-style client components", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-member-imports-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "widgets.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export const components = {
  Counter() {
    const count = cell(0);
    return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
  },
};`,
    );
    const code = `import { components } from "./widgets";

export default function Page() {
  return <components.Counter />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/member",
      }),
    ).resolves.toMatchObject({
      client: true,
      clientBoundaryImports: ["./widgets"],
      diagnostics: [],
    });
  });

  test("inferClientRouteModule follows literal object registry aliases", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-registry-alias-"));
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

const registry = { Counter };
const Selected = registry.Counter;

export default function Page() {
  return <Selected />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/registry-alias",
      }),
    ).resolves.toMatchObject({
      client: true,
      clientBoundaryImports: ["./Counter"],
      diagnostics: [],
    });
  });

  test("inferClientRouteModule follows namespace members through literal object registry aliases", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-namespace-registry-alias-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "widgets.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
    );
    const code = `import * as widgets from "./widgets";

const registry = { Counter: widgets.Counter };
const Selected = registry.Counter;

export default function Page() {
  return <Selected />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/namespace-registry-alias",
      }),
    ).resolves.toMatchObject({
      client: true,
      clientBoundaryImports: ["./widgets"],
      diagnostics: [],
    });
  });

  test("inferClientRouteModule follows static computed registry keys", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-computed-registry-key-"));
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

const registry = { Counter };
const selected = "Counter";
const Selected = registry[selected];

export default function Page() {
  return <Selected />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/computed-registry-key",
      }),
    ).resolves.toMatchObject({
      client: true,
      clientBoundaryImports: ["./Counter"],
      diagnostics: [],
    });
  });

  test("inferClientRouteModule follows static registry assignment aliases", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-registry-assignment-"));
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

const registry = {};
registry.Counter = Counter;
const Selected = registry.Counter;

export default function Page() {
  return <Selected />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/registry-assignment",
      }),
    ).resolves.toMatchObject({
      client: true,
      clientBoundaryImports: ["./Counter"],
      diagnostics: [],
    });
  });

  test("inferClientRouteModule follows namespace members through Object.assign registries", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-namespace-assign-registry-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "widgets.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
    );
    const code = `import * as widgets from "./widgets";

const registry = {};
Object.assign(registry, { Counter: widgets.Counter });
const selected = "Counter";
const Selected = registry[selected];

export default function Page() {
  return <Selected />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/namespace-assign-registry",
      }),
    ).resolves.toMatchObject({
      client: true,
      clientBoundaryImports: ["./widgets"],
      diagnostics: [],
    });
  });

  test("inferClientRouteModule reports conditional client component selection", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-conditional-selection-"));
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

function Placeholder() {
  return <span>placeholder</span>;
}

const Selected = Math.random() > 0.5 ? Counter : Placeholder;

export default function Page() {
  return <Selected />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/conditional-selection",
      }),
    ).resolves.toMatchObject({
      client: false,
      clientBoundaryImports: [],
      diagnostics: [
        expect.objectContaining({
          code: "MR_CLIENT_BOUNDARY_INFERENCE_UNSUPPORTED_REFERENCE",
          level: "warn",
          source: "./Counter",
        }),
      ],
    });
  });

  test("inferClientRouteModule follows runtime conditionals that collapse to one client component", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-single-candidate-conditional-"));
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

const Selected = Math.random() > 0.5 ? Counter : Counter;

export default function Page() {
  return <Selected />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/single-candidate-conditional",
      }),
    ).resolves.toMatchObject({
      client: true,
      clientBoundaryImports: ["./Counter"],
      diagnostics: [],
    });
  });

  test("inferClientRouteModule follows dynamic registry keys that collapse to one client component", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-single-candidate-registry-"));
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

const registry = { Counter };
const selected = Math.random() > 0.5 ? "Counter" : "Counter";
const Selected = registry[selected];

export default function Page() {
  return <Selected />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/single-candidate-registry",
      }),
    ).resolves.toMatchObject({
      client: true,
      clientBoundaryImports: ["./Counter"],
      diagnostics: [],
    });
  });

  test("inferClientRouteModule reports namespace client imports used through computed selection", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-namespace-computed-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "widgets.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
    );
    const code = `import * as widgets from "./widgets";

const selected = Math.random() > 0.5 ? "Counter" : "Fallback";
const Selected = widgets[selected];

export default function Page() {
  return <Selected />;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/namespace-computed",
      }),
    ).resolves.toMatchObject({
      client: false,
      clientBoundaryImports: [],
      diagnostics: [
        expect.objectContaining({
          code: "MR_CLIENT_BOUNDARY_INFERENCE_UNSUPPORTED_REFERENCE",
          level: "warn",
          source: "./widgets",
        }),
      ],
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
    ).resolves.toMatchObject({
      client: false,
      clientBoundaryImports: [],
      diagnostics: [],
    });
  });

  test("inferClientRouteModule ignores imports used only by stripped loader exports", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-loader-only-imports-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "server-config.ts"),
      `import { cell } from "@reckona/mreact-reactive-core";

export const config = cell("server");
export function loadConfig() {
  return config.get();
}
export const isProd = false;
`,
    );
    await writeFile(
      join(appDir, "db.ts"),
      `import { isProd, loadConfig } from "./server-config";

export function queryAdmin() {
  return { env: loadConfig(), preview: !isProd };
}
`,
    );
    const code = `import { queryAdmin } from "./db";

export function loader() {
  return queryAdmin();
}

export default function Page() {
  return <main>Admin</main>;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code: stripRouteClientOnlyExports(code),
        filename: pageFile,
        routePath: "/admin",
      }),
    ).resolves.toMatchObject({
      client: false,
      clientBoundaryImports: [],
      diagnostics: [],
    });
  });

  test("inferClientRouteModule ignores lowercase server helper imports with client-like internals", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-server-helper-imports-"));
    const pageFile = join(appDir, "page.tsx");
    await writeFile(
      join(appDir, "config.ts"),
      `import { cell } from "@reckona/mreact-reactive-core";

const config = cell("server");
export function loadConfig() {
  return config.get();
}
export const isProd = false;
`,
    );
    await writeFile(
      join(appDir, "session.ts"),
      `import { isProd, loadConfig } from "./config";

export function readSession() {
  return { env: loadConfig(), preview: !isProd };
}
`,
    );
    const code = `import { readSession } from "./session";

export default function Page() {
  const session = readSession();
  return <main>{session.env}</main>;
}`;
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        code,
        filename: pageFile,
        routePath: "/admin",
      }),
    ).resolves.toMatchObject({
      client: false,
      clientBoundaryImports: [],
      diagnostics: [],
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

  test("inferClientRouteModule refreshes cached app-local sources after file changes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-client-source-cache-"));
    const pageFile = join(appDir, "page.tsx");
    const childFile = join(appDir, "Child.tsx");
    const code = `import { Child } from "./Child";

export default function Page() {
  return <Child />;
}`;
    const cache = createClientRouteInferenceCache();

    await writeFile(
      childFile,
      `export function Child() {
  return <p>Server child</p>;
}`,
    );
    await writeFile(pageFile, code);

    await expect(
      inferClientRouteModule({
        cache,
        code,
        filename: pageFile,
        routePath: "/cache-refresh",
      }),
    ).resolves.toMatchObject({
      client: false,
      clientBoundaryImports: [],
      diagnostics: [],
    });

    await writeFile(
      childFile,
      `import { cell } from "@reckona/mreact-reactive-core";

export function Child() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>count: {count.get()}</button>;
}`,
    );

    await expect(
      inferClientRouteModule({
        cache,
        code,
        filename: pageFile,
        routePath: "/cache-refresh",
      }),
    ).resolves.toMatchObject({
      client: true,
      clientBoundaryImports: ["./Child"],
      diagnostics: [],
    });
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
