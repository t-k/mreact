import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runServerComponent, runServerStreamComponent } from "./helpers.js";

describe("compiler TypeScript syntax stripping", () => {
  test("strips helper signatures, declarations, generic calls, and as casts from server output", () => {
    const output = transform({
      code: `interface Article { title: string }
type Mode = "idle" | "hot";

function makeArticles(mode: Mode): Promise<Article[]> {
  const title = ("Ada" as string).toUpperCase();
  return Promise.resolve([{ title }]);
}

function first<T>(value: T): T {
  return value;
}

export default function Page() {
  const mode = first<Mode>("hot");
  return <main>{mode}:{makeArticles.length}</main>;
}`,
      filename: "Page.mreact.tsx",
      target: "server",
      serverOutput: "string",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("interface Article");
    expect(output.code).not.toContain("type Mode");
    expect(output.code).not.toContain(": Promise<Article[]>");
    expect(output.code).not.toContain("<Mode>");
    expect(output.code).not.toContain(" as string");
    expect(runServerComponent(output.code, "default")).toBe("<main>hot:1</main>");
  });

  test("strips TypeScript syntax from server stream preserved helpers", async () => {
    const output = transform({
      code: `type Label = { value: string };

function label(value: string): Label {
  return { value };
}

export function App() {
  return <p>{label("stream").value}</p>;
}`,
      filename: "Stream.mreact.tsx",
      target: "server",
      serverOutput: "stream",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("type Label");
    expect(output.code).not.toContain("value: string");
    await expect(runServerStreamComponent(output.code)).resolves.toBe("<p>stream</p>");
  });
});
