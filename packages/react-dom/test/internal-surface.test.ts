import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("react-dom internal package surface", () => {
  test("does not depend on react-compat internal entrypoints", async () => {
    const source = await readFile(
      join(process.cwd(), "packages", "react-dom", "src", "index.ts"),
      "utf8",
    );

    expect(source).not.toContain("@reckona/mreact-compat/internal");
    expect(source).toContain("@reckona/mreact-compat/event-priority");
  });
});
