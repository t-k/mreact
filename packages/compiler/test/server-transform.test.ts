import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";

describe("compiler server JSX transform", () => {
  test("emitted static server component returns an HTML string", () => {
    const output = transform({
      code: 'export function App() { return <div id="app">Hello SSR</div>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const runnableCode = output.code.replace(
      "export function App()",
      "function App()",
    );
    const App = new Function(`${runnableCode}\nreturn App;`) as () => () => string;

    expect(App()()).toBe('<div id="app">Hello SSR</div>');
  });

  test("emitted dynamic server component preserves body statements and escapes HTML", () => {
    const output = transform({
      code: 'export function App() { const name = "<Ada>"; return <p>Hello {name}</p>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const runnableCode = output.code.replace(
      "export function App()",
      "function App()",
    );
    const App = new Function(`${runnableCode}\nreturn App;`) as () => () => string;

    expect(App()()).toBe("<p>Hello &lt;Ada&gt;</p>");
  });
});
