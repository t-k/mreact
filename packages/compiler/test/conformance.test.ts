// @vitest-environment happy-dom

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import type { CompileTarget, RuntimeImport } from "../src/types.js";
import { runClientComponent, runServerComponent } from "./helpers.js";

interface ConformanceFixture {
  name: string;
  target: CompileTarget;
  code: string;
  expected: {
    diagnostics: string[];
    components?: Array<{ name: string; exportName: string }>;
    imports?: RuntimeImport[];
    client?: {
      tagName: string;
      textContent: string;
      attributes: Record<string, string>;
    };
    serverHtml?: string | null;
  };
}

const fixturesDir = join(
  process.cwd(),
  "packages/compiler/test/fixtures/conformance",
);
const fixtureNames = (await readdir(fixturesDir))
  .filter((name) => name.endsWith(".json"))
  .sort();

describe("compiler conformance fixtures", () => {
  for (const fixtureName of fixtureNames) {
    test(fixtureName, async () => {
      const fixture = JSON.parse(
        await readFile(join(fixturesDir, fixtureName), "utf8"),
      ) as ConformanceFixture;

      const output = transform({
        code: fixture.code,
        filename: `${fixture.name}.tsx`,
        target: fixture.target,
        dev: true,
      });

      expect(output.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
        fixture.expected.diagnostics,
      );

      if (fixture.expected.components !== undefined) {
        expect(output.metadata.components).toEqual(
          fixture.expected.components,
        );
      }

      if (fixture.expected.imports !== undefined) {
        expect(output.metadata.imports).toEqual(fixture.expected.imports);
      }

      if (fixture.expected.client !== undefined) {
        const node = await runClientComponent(output.code);
        expect((node as Element).tagName).toBe(
          fixture.expected.client.tagName,
        );
        expect(node.textContent).toBe(fixture.expected.client.textContent);

        for (const [name, value] of Object.entries(
          fixture.expected.client.attributes,
        )) {
          expect((node as Element).getAttribute(name)).toBe(value);
        }
      }

      if (fixture.expected.serverHtml !== undefined) {
        if (fixture.expected.serverHtml === null) {
          expect(output.diagnostics.length).toBeGreaterThan(0);
        } else {
          expect(runServerComponent(output.code)).toBe(
            fixture.expected.serverHtml,
          );
        }
      }
    });
  }
});
