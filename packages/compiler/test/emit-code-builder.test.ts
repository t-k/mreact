import { describe, expect, test } from "vitest";
import { createCodeBuilder } from "../src/emit-code-builder.js";

describe("compiler emit code builder", () => {
  test("joins non-empty sections with blank lines and preserves trailing newline", () => {
    const builder = createCodeBuilder();

    builder.section("");
    builder.section("import { x } from \"x\";");
    builder.section("function helper() {}");
    builder.section("export function App() {}");

    expect(builder.toString()).toBe(
      'import { x } from "x";\n\nfunction helper() {}\n\nexport function App() {}\n',
    );
  });

  test("can prefix a section with an extra separator for byte-compatible stream helper blocks", () => {
    const builder = createCodeBuilder();

    builder.section("function helper() {}");
    builder.section("function optional() {}", { leadingBlankLines: 2 });

    expect(builder.toString()).toBe("function helper() {}\n\n\nfunction optional() {}\n");
  });
});
