import { describe, expect, test } from "vitest";
import { analyzeBoundaryGraph } from "../src/index.js";

describe("analyzeBoundaryGraph", () => {
  test("classifies an entry render export as server-render when no client capability is reachable", async () => {
    const files = new Map([
      [
        "/app/page.tsx",
        `export default function Page() {
  return <main>Dashboard</main>;
}`,
      ],
    ]);

    const result = await analyzeBoundaryGraph({
      entries: [{ file: "/app/page.tsx", kind: "route-page" }],
      readModule: async (file) => files.get(file),
      resolveModule: async () => undefined,
    });

    expect(result.modules).toMatchObject([
      {
        file: "/app/page.tsx",
        classification: "server-render",
        exports: [{ name: "default", classification: "server-render" }],
      },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  test("classifies an imported JSX component with reachable client capability as a client boundary", async () => {
    const files = new Map([
      [
        "/app/page.tsx",
        `import { Counter } from "./Counter";

export default function Page() {
  return <main><Counter /></main>;
}`,
      ],
      [
        "/app/Counter.tsx",
        `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
      ],
    ]);

    const result = await analyzeBoundaryGraph({
      entries: [{ file: "/app/page.tsx", kind: "route-page" }],
      readModule: async (file) => files.get(file),
      resolveModule: async ({ importer, source }) =>
        importer === "/app/page.tsx" && source === "./Counter"
          ? "/app/Counter.tsx"
          : undefined,
    });

    expect(result.modules).toMatchObject([
      {
        file: "/app/page.tsx",
        classification: "server-render",
        exports: [{ name: "default", classification: "server-render" }],
      },
      {
        file: "/app/Counter.tsx",
        classification: "client-boundary",
        exports: [{ name: "Counter", classification: "client-boundary" }],
      },
    ]);
    expect(result.clientBoundaries).toEqual([
      {
        exportNames: ["Counter"],
        importerFile: "/app/page.tsx",
        moduleFile: "/app/Counter.tsx",
        source: "./Counter",
      },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  test("classifies a generic module entry with client capability as a client boundary", async () => {
    const files = new Map([
      [
        "/components/Counter.tsx",
        `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
      ],
    ]);

    const result = await analyzeBoundaryGraph({
      entries: [{ file: "/components/Counter.tsx", kind: "module" }],
      readModule: async (file) => files.get(file),
      resolveModule: async () => undefined,
    });

    expect(result.modules).toMatchObject([
      {
        file: "/components/Counter.tsx",
        classification: "client-boundary",
        exports: [{ name: "Counter", classification: "client-boundary" }],
      },
    ]);
  });

  test("propagates client boundary classification through barrel re-exports", async () => {
    const files = new Map([
      [
        "/app/page.tsx",
        `import { Counter } from "./components";

export default function Page() {
  return <Counter />;
}`,
      ],
      ["/app/components.ts", `export { Counter } from "./Counter";`],
      [
        "/app/Counter.tsx",
        `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
      ],
    ]);

    const result = await analyzeBoundaryGraph({
      entries: [{ file: "/app/page.tsx", kind: "route-page" }],
      readModule: async (file) => files.get(file),
      resolveModule: async ({ importer, source }) => {
        if (importer === "/app/page.tsx" && source === "./components") {
          return "/app/components.ts";
        }

        if (importer === "/app/components.ts" && source === "./Counter") {
          return "/app/Counter.tsx";
        }

        return undefined;
      },
    });

    expect(result.modules).toMatchObject([
      {
        file: "/app/page.tsx",
        classification: "server-render",
      },
      {
        file: "/app/components.ts",
        classification: "client-boundary",
        exports: [{ name: "Counter", classification: "client-boundary" }],
      },
      {
        file: "/app/Counter.tsx",
        classification: "client-boundary",
        exports: [{ name: "Counter", classification: "client-boundary" }],
      },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  test.each([
    {
      name: "simple alias",
      page: `import { Counter } from "./Counter";

const Selected = Counter;

export default function Page() {
  return <Selected />;
}`,
    },
    {
      name: "literal object registry alias",
      page: `import { Counter } from "./Counter";

const registry = { Counter };
const Selected = registry.Counter;

export default function Page() {
  return <Selected />;
}`,
    },
    {
      name: "static computed registry key",
      page: `import { Counter } from "./Counter";

const registry = { Counter };
const selected = "Counter";
const Selected = registry[selected];

export default function Page() {
  return <Selected />;
}`,
    },
  ])("classifies client boundaries through $name", async ({ page }) => {
    const files = new Map([
      ["/app/page.tsx", page],
      [
        "/app/Counter.tsx",
        `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
      ],
    ]);

    const result = await analyzeBoundaryGraph({
      entries: [{ file: "/app/page.tsx", kind: "route-page" }],
      readModule: async (file) => files.get(file),
      resolveModule: async ({ importer, source }) =>
        importer === "/app/page.tsx" && source === "./Counter"
          ? "/app/Counter.tsx"
          : undefined,
    });

    expect(result.modules).toMatchObject([
      { file: "/app/page.tsx", classification: "server-render" },
      {
        file: "/app/Counter.tsx",
        classification: "client-boundary",
        exports: [{ name: "Counter", classification: "client-boundary" }],
      },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  test("classifies namespace member client boundaries", async () => {
    const files = new Map([
      [
        "/app/page.tsx",
        `import * as widgets from "./widgets";

export default function Page() {
  return <widgets.Counter />;
}`,
      ],
      [
        "/app/widgets.tsx",
        `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
      ],
    ]);

    const result = await analyzeBoundaryGraph({
      entries: [{ file: "/app/page.tsx", kind: "route-page" }],
      readModule: async (file) => files.get(file),
      resolveModule: async ({ importer, source }) =>
        importer === "/app/page.tsx" && source === "./widgets"
          ? "/app/widgets.tsx"
          : undefined,
    });

    expect(result.modules).toMatchObject([
      { file: "/app/page.tsx", classification: "server-render" },
      {
        file: "/app/widgets.tsx",
        classification: "client-boundary",
        exports: [{ name: "Counter", classification: "client-boundary" }],
      },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  test("infers imported form actions as server action sites", async () => {
    const files = new Map([
      [
        "/app/page.tsx",
        `import { save } from "./actions";

export default function Page() {
  return <form action={save}><button>Save</button></form>;
}`,
      ],
      [
        "/app/actions.ts",
        `export async function save(formData: FormData) {
  return { ok: true, title: formData.get("title") };
}`,
      ],
    ]);

    const result = await analyzeBoundaryGraph({
      entries: [{ file: "/app/page.tsx", kind: "route-page" }],
      readModule: async (file) => files.get(file),
      resolveModule: async ({ importer, source }) =>
        importer === "/app/page.tsx" && source === "./actions"
          ? "/app/actions.ts"
          : undefined,
    });

    expect(result.serverActions).toEqual([
      expect.objectContaining({
        exportName: "save",
        expression: "save",
        file: "/app/page.tsx",
        inferred: true,
        moduleFile: "/app/actions.ts",
      }),
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  test.each([
    {
      name: "use server directive",
      source: `"use server";
import { cell } from "@reckona/mreact-reactive-core";

export function ServerCounter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
    },
    {
      name: "Node builtin import",
      source: `import { readFile } from "fs/promises";
import { cell } from "@reckona/mreact-reactive-core";

export function ServerCounter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
    },
  ])("keeps $name modules server-only even when client syntax is present", async ({ source }) => {
    const files = new Map([
      [
        "/app/page.tsx",
        `import { ServerCounter } from "./ServerCounter";

export default function Page() {
  return <ServerCounter />;
}`,
      ],
      ["/app/ServerCounter.tsx", source],
    ]);

    const result = await analyzeBoundaryGraph({
      entries: [{ file: "/app/page.tsx", kind: "route-page" }],
      readModule: async (file) => files.get(file),
      resolveModule: async ({ importer, source }) =>
        importer === "/app/page.tsx" && source === "./ServerCounter"
          ? "/app/ServerCounter.tsx"
          : undefined,
    });

    expect(result.modules).toMatchObject([
      { file: "/app/page.tsx", classification: "server-render" },
      {
        file: "/app/ServerCounter.tsx",
        classification: "server-only",
        exports: [{ name: "ServerCounter", classification: "server-only" }],
      },
    ]);
    expect(result.clientBoundaries).toEqual([]);
  });

  test.each([
    {
      expression: "alias",
      page: `import { save } from "./actions";

const alias = save;

export default function Page() {
  return <form action={alias}><button>Save</button></form>;
}`,
    },
    {
      expression: "actions.save",
      page: `import { save } from "./actions";

const actions = { save };

export default function Page() {
  return <form action={actions.save}><button>Save</button></form>;
}`,
    },
  ])("infers $expression form action aliases as server action sites", async ({ expression, page }) => {
    const files = new Map([
      ["/app/page.tsx", page],
      [
        "/app/actions.ts",
        `export async function save(formData: FormData) {
  return { ok: true, title: formData.get("title") };
}`,
      ],
    ]);

    const result = await analyzeBoundaryGraph({
      entries: [{ file: "/app/page.tsx", kind: "route-page" }],
      readModule: async (file) => files.get(file),
      resolveModule: async ({ importer, source }) =>
        importer === "/app/page.tsx" && source === "./actions"
          ? "/app/actions.ts"
          : undefined,
    });

    expect(result.serverActions).toEqual([
      expect.objectContaining({
        exportName: "save",
        expression,
        file: "/app/page.tsx",
        inferred: true,
        moduleFile: "/app/actions.ts",
      }),
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  test.each([
    {
      expression: "actions.save",
      page: `import * as actions from "./actions";

export default function Page() {
  return <form action={actions.save}><button>Save</button></form>;
}`,
      serverDirective: false,
    },
    {
      expression: "save",
      page: `import { save } from "./actions";

export default function Page() {
  return <form action={save}><button>Save</button></form>;
}`,
      serverDirective: true,
    },
  ])(
    "infers $expression namespace/use-server form actions",
    async ({ expression, page, serverDirective }) => {
      const files = new Map([
        ["/app/page.tsx", page],
        [
          "/app/actions.ts",
          `${serverDirective ? '"use server";\n' : ""}export async function save(formData: FormData) {
  return { ok: true, title: formData.get("title") };
}`,
        ],
      ]);

      const result = await analyzeBoundaryGraph({
        entries: [{ file: "/app/page.tsx", kind: "route-page" }],
        readModule: async (file) => files.get(file),
        resolveModule: async ({ importer, source }) =>
          importer === "/app/page.tsx" && source === "./actions"
            ? "/app/actions.ts"
            : undefined,
      });

      expect(result.serverActions).toEqual([
        expect.objectContaining({
          exportName: "save",
          expression,
          file: "/app/page.tsx",
          inferred: !serverDirective,
          moduleFile: "/app/actions.ts",
        }),
      ]);
    },
  );
});
