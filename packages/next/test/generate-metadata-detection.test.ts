import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("@reckona/mreact-compiler");
  vi.resetModules();
});

describe("@reckona/mreact-next metadata-based detection", () => {
  test("uses compiler component metadata instead of generated output string matching", async () => {
    vi.doMock("@reckona/mreact-compiler", () => ({
      transform() {
        return {
          code: "export const Card = () => document.createElement(\"span\");",
          diagnostics: [],
          map: null,
          metadata: {
            components: [{ name: "Card", exportName: "Card" }],
          },
        };
      },
    }));
    const { compileMreactComponentModule } = await import("../src/index.js");

    const output = compileMreactComponentModule(
      "export function Card() { return <span />; }",
      "Card.mreact.tsx",
      { domImportPath: "./Card.mreact-dom" },
    );

    expect(output.wrapperCode).toContain(
      "export function Card(props: Record<string, unknown>): never",
    );
    expect(output.domCode).toContain("export const Card =");
  });
});
