import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("createElement module", () => {
  test("keeps the public createElement implementation off rest parameter arrays", async () => {
    const source = await readFile(
      join(process.cwd(), "packages/react-compat/src/element.ts"),
      "utf8",
    );
    const implementationStart = source.indexOf(
      "export function createElement<P extends object>(\n  type: ElementType<P>,\n  config: (P & ReactReservedProps) | null,\n): ReactCompatElement<P> {",
    );

    expect(implementationStart).toBeGreaterThanOrEqual(0);

    const implementationEnd = source.indexOf(
      "\n/** Creates a React-compatible element from JSX runtime arguments. */",
      implementationStart,
    );
    const implementation = source.slice(implementationStart, implementationEnd);

    expect(implementation).toContain("arguments.length");
    expect(implementation).not.toContain("...children");
  });
});
