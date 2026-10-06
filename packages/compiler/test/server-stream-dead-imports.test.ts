import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runServerStreamComponent } from "./helpers.js";

describe("server stream runtime import ownership", () => {
  test("does not import compat rendering for escaped JSX-like literal text", async () => {
    const output = transform({
      code: `export function App() { return <p>Escaped: {"<script>alert(1)</script>"}</p>; }`,
      filename: "escaped-stream.tsx",
      target: "server",
      dev: false,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("@reckona/mreact-compat");
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      "<p>Escaped: <!-- -->&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  test("retains compat rendering when a legacy component is actually rendered", () => {
    const output = transform({
      code: `import { Legacy } from "legacy-components";
        export function App() { return <main><Legacy /></main>; }`,
      filename: "compat-stream.tsx",
      target: "server",
      dev: false,
      mode: "compat",
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("@reckona/mreact-compat");
    expect(output.code).toContain("_renderCompatToString(Legacy");
  });
});
