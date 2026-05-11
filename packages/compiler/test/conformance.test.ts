// @vitest-environment happy-dom

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import type { CompileTarget, ParserMode, RuntimeImport } from "../src/types.js";
import {
  runClientComponent,
  runCompatComponent,
  runCompatServerComponent,
  runServerComponent,
  runServerStreamComponent,
} from "./helpers.js";

interface ConformanceFixture {
  name: string;
  target: CompileTarget;
  mode?: "auto" | "reactive" | "compat";
  serverOutput?: "string" | "stream";
  serverBootstrap?: "none" | "out-of-order-reorder";
  serverBootstrapNonce?: string;
  serverBootstrapSrc?: string;
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
    codeContains?: string[];
  };
}

const fixturesDir = join(
  process.cwd(),
  "packages/compiler/test/fixtures/conformance",
);
const expectedFixtureNames = [
  "client-component-composition.json",
  "client-dynamic-text.json",
  "client-generated-name-hygiene.json",
  "client-jsx-conditional.json",
  "client-jsx-entity.json",
  "client-jsx-keyed-list.json",
  "client-jsx-spread.json",
  "client-module-statement.json",
  "client-parenthesized-return.json",
  "client-static.json",
  "client-typescript-parameter.json",
  "client-user-import.json",
  "compat-call-argument-jsx.json",
  "compat-dynamic-text.json",
  "compat-fragment.json",
  "compat-jsx-entity.json",
  "compat-react-node-return.json",
  "compat-static.json",
  "server-compat-call-argument-jsx.json",
  "server-compat-react-node-return.json",
  "server-dynamic-text-escape.json",
  "server-jsx-entity.json",
  "server-static.json",
  "server-stream-await.json",
  "server-stream-compat-react-node-return.json",
  "server-stream-dynamic.json",
  "server-stream-jsx-entity.json",
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

      await assertFixture(fixture);
    });
  }
});

describe("compiler conformance fixtures with Oxc parser", () => {
  for (const fixtureName of fixtureNames) {
    test(fixtureName, async () => {
      const fixture = JSON.parse(
        await readFile(join(fixturesDir, fixtureName), "utf8"),
      ) as ConformanceFixture;

      await assertFixture(fixture, "oxc");
    });
  }

  test("explicit Oxc parser output matches default output for every fixture", async () => {
    for (const fixtureName of fixtureNames) {
      const fixture = JSON.parse(
        await readFile(join(fixturesDir, fixtureName), "utf8"),
      ) as ConformanceFixture;
      const baseInput = {
        code: fixture.code,
        filename: `${fixture.name}.tsx`,
        target: fixture.target,
        dev: true,
        mode: fixture.mode,
        serverOutput: fixture.serverOutput,
        serverBootstrap: fixture.serverBootstrap,
        serverBootstrapNonce: fixture.serverBootstrapNonce,
        serverBootstrapSrc: fixture.serverBootstrapSrc,
      } as const;
      const defaultOutput = transform(baseInput);
      const oxcOutput = transform({
        ...baseInput,
        parser: "oxc",
      });

      expect(
        {
          fixtureName,
          code: oxcOutput.code,
          diagnostics: oxcOutput.diagnostics.map((diagnostic) => diagnostic.code),
          metadata: oxcOutput.metadata,
        },
      ).toEqual({
        fixtureName,
        code: defaultOutput.code,
        diagnostics: defaultOutput.diagnostics.map((diagnostic) => diagnostic.code),
        metadata: defaultOutput.metadata,
      });
    }
  });
});

async function assertFixture(
  fixture: ConformanceFixture,
  parser?: ParserMode,
): Promise<void> {
      const output = transform({
        code: fixture.code,
        filename: `${fixture.name}.tsx`,
        target: fixture.target,
        dev: true,
        mode: fixture.mode,
        serverOutput: fixture.serverOutput,
        serverBootstrap: fixture.serverBootstrap,
        serverBootstrapNonce: fixture.serverBootstrapNonce,
        serverBootstrapSrc: fixture.serverBootstrapSrc,
        parser,
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

      if (fixture.expected.codeContains !== undefined) {
        for (const expectedCode of fixture.expected.codeContains) {
          expect(output.code).toContain(expectedCode);
        }
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
          expect(
            fixture.mode === "compat"
              ? runCompatServerComponent(output.code)
              : runServerComponent(output.code),
          ).toBe(
            fixture.expected.serverHtml,
          );
        }
      }

      if (fixture.expected.serverStreamHtml !== undefined) {
        await expect(runServerStreamComponent(output.code)).resolves.toBe(
          fixture.expected.serverStreamHtml,
        );
      }
}

function readAttributes(element: Element): Record<string, string> {
  return Object.fromEntries(
    Array.from(element.attributes, (attribute) => [
      attribute.name,
      attribute.value,
    ]),
  );
}
