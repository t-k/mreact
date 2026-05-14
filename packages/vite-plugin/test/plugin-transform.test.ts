import { describe, expect, test } from "vitest";
import { modularReact } from "../src/index.js";

describe("modularReact vite plugin transform", () => {
  test("transforms tsx files through compiler client target", async () => {
    const plugin = modularReact();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    const result = await transform.call(
      {
        error(error: string | Error): never {
          throw typeof error === "string" ? new Error(error) : error;
        },
        warn() {},
      } as never,
      'export function App() { return <div id="app">Hello</div>; }',
      "/src/App.tsx",
      { ssr: false },
    );

    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
    expect((result as { code: string }).code).toContain("createTemplate");
    expect((result as { code: string }).code).toContain("export function App()");
  });

  test("ignores non jsx modules", async () => {
    const plugin = modularReact();
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    const result = await transform.call({} as never, "export const x = 1;", "/src/value.ts");

    expect(result).toBeNull();
  });

  test("forwards server stream output mode for ssr transforms", async () => {
    const plugin = modularReact({ serverOutput: "stream" });
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    const result = await transform.call(
      {
        error(error: string | Error): never {
          throw typeof error === "string" ? new Error(error) : error;
        },
        warn() {},
      } as never,
      'export function App() { return <div id="app">Hello stream</div>; }',
      "/src/App.tsx",
      { ssr: true },
    );

    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
    expect((result as { code: string }).code).toContain(".append(");
    expect((result as { code: string }).code).toContain("Hello stream");
  });

  test("forwards server bootstrap mode for ssr stream transforms", async () => {
    const plugin = modularReact({
      serverOutput: "stream",
      serverBootstrap: "out-of-order-reorder",
    });
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    const result = await transform.call(
      {
        error(error: string | Error): never {
          throw typeof error === "string" ? new Error(error) : error;
        },
        warn() {},
      } as never,
      'export function App() { const name = Promise.resolve("Ada"); return <section><Await value={name} placeholder={<span>Loading</span>}>{value => <span>{value}</span>}</Await></section>; }',
      "/src/App.tsx",
      { ssr: true },
    );

    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
    expect((result as { code: string }).code).toContain("renderOutOfOrderReorderScript");
  });

  test("forwards server bootstrap nonce and src for ssr stream transforms", async () => {
    const plugin = modularReact({
      serverOutput: "stream",
      serverBootstrap: "out-of-order-reorder",
      serverBootstrapNonce: "nonce-1",
      serverBootstrapSrc: "/assets/mreact-reorder.js",
    });
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    const result = await transform.call(
      {
        error(error: string | Error): never {
          throw typeof error === "string" ? new Error(error) : error;
        },
        warn() {},
      } as never,
      'export function App() { const name = Promise.resolve("Ada"); return <section><Await value={name} placeholder={<span>Loading</span>}>{value => <span>{value}</span>}</Await></section>; }',
      "/src/App.tsx",
      { ssr: true },
    );

    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
    expect((result as { code: string }).code).toContain('nonce: "nonce-1"');
    expect((result as { code: string }).code).toContain('src: "/assets/mreact-reorder.js"');
  });

  test("forwards React Suspense external reveal script src for ssr stream transforms", async () => {
    const plugin = modularReact({
      serverOutput: "stream",
      serverBootstrapNonce: "nonce-1",
      reactSuspenseRevealScriptSrc: "/assets/mreact-react-suspense-reveal.js",
    });
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    const result = await transform.call(
      {
        error(error: string | Error): never {
          throw typeof error === "string" ? new Error(error) : error;
        },
        warn() {},
      } as never,
      `import { Suspense } from "@modular-react/react-compat";
      export function App() {
        const name = Promise.resolve("Ada");
        return <Suspense fallback={<em>loading</em>}><Await value={name}>{value => <strong>{value}</strong>}</Await></Suspense>;
      }`,
      "/src/App.tsx",
      { ssr: true },
    );

    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
    expect((result as { code: string }).code).toContain('nonce: "nonce-1"');
    expect((result as { code: string }).code).toContain(
      'src: "/assets/mreact-react-suspense-reveal.js"',
    );
  });

  test("reports Flight client references from ssr transforms", async () => {
    const references: unknown[] = [];
    const plugin = modularReact({
      onFlightClientReferences(filename, entries) {
        references.push([filename, entries]);
      },
    });
    const transform = plugin.transform;

    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }

    await transform.call(
      {
        error(error: string | Error): never {
          throw typeof error === "string" ? new Error(error) : error;
        },
        warn() {},
      } as never,
      `import { Button } from "./Button.client.tsx";
      export function App() {
        return <Button label="Save" />;
      }`,
      "/src/App.tsx",
      { ssr: true },
    );

    expect(references).toEqual([
      [
        "/src/App.tsx",
        [
          {
            name: "Button",
            moduleId: "./Button.client.tsx",
            exportName: "Button",
          },
        ],
      ],
    ]);
  });
});
