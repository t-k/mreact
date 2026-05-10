// @vitest-environment happy-dom

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import type { CompileTarget, RuntimeImport } from "../src/types.js";
import {
  runClientComponent,
  runCompatComponent,
  runServerComponent,
  runServerStreamComponent,
} from "./helpers.js";

interface ConformanceFixture {
  name: string;
  target: CompileTarget;
  mode?: "auto" | "reactive" | "compat";
  serverOutput?: "string" | "stream";
  serverBootstrap?: "none" | "out-of-order-reorder";
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
    compatHtml?: string;
    serverHtml?: string | null;
    serverStreamHtml?: string;
  };
}

const fixturesDir = join(
  process.cwd(),
  "packages/compiler/test/fixtures/conformance",
);
const expectedFixtureNames = [
  "client-dynamic-text.json",
  "client-generated-name-hygiene.json",
  "client-static.json",
  "compat-dynamic-text.json",
  "compat-fragment.json",
  "compat-static.json",
  "server-dynamic-text-escape.json",
  "server-static.json",
  "server-stream-await.json",
  "server-stream-dynamic.json",
  "server-stream-oob-await.json",
  "server-stream-oob-bootstrap.json",
  "server-unsupported-dynamic-attr.json",
];
const fixtureNames = (await readdir(fixturesDir))
  .filter((name) => name.endsWith(".json"))
  .sort();

describe("compiler conformance fixtures", () => {
  test("fixture set is explicit", () => {
    expect(fixtureNames).toEqual(expectedFixtureNames);
  });

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
        mode: fixture.mode,
        serverOutput: fixture.serverOutput,
        serverBootstrap: fixture.serverBootstrap,
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
        expect(readAttributes(node as Element)).toEqual(
          fixture.expected.client.attributes,
        );
      }

      if (fixture.expected.compatHtml !== undefined) {
        const container = await runCompatComponent(output.code);
        expect(container.innerHTML).toBe(fixture.expected.compatHtml);
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

      if (fixture.expected.serverStreamHtml !== undefined) {
        await expect(runServerStreamComponent(output.code)).resolves.toBe(
          fixture.expected.serverStreamHtml,
        );
      }
    });
  }
});

function readAttributes(element: Element): Record<string, string> {
  return Object.fromEntries(
    Array.from(element.attributes, (attribute) => [
      attribute.name,
      attribute.value,
    ]),
  );
}
