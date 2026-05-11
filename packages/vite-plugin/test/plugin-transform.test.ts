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
      'export function App() { const name = Promise.resolve("Ada"); return <section><await value={name} placeholder={<span>Loading</span>}>{value => <span>{value}</span>}</await></section>; }',
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
      'export function App() { const name = Promise.resolve("Ada"); return <section><await value={name} placeholder={<span>Loading</span>}>{value => <span>{value}</span>}</await></section>; }',
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
        return <Suspense fallback={<em>loading</em>}><await value={name}>{value => <strong>{value}</strong>}</await></Suspense>;
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
});
