import { describe, expect, it } from "vitest";
import { explainTransform, transform } from "../src/index.js";

describe("explainTransform", () => {
  it("links source-site decisions to generated code and a labeled source map", () => {
    const code = [
      'import { cell } from "@reckona/mreact-reactive-core";',
      "export function App() {",
      "  const count = cell(1);",
      "  return <p>{count.get()}</p>;",
      "}",
    ].join("\n");
    const input = { code, filename: "App.tsx", target: "client" as const, dev: false };

    const report = explainTransform(input);
    const compiled = transform({ ...input, reportClientSpecializations: true, sourceMap: true });

    expect(report).toMatchObject({
      schemaVersion: 1,
      filename: "App.tsx",
      target: "client",
      mode: "reactive",
      generated: {
        code: compiled.code,
        sourceMap: compiled.map,
        sourceMapAccuracy: "heuristic",
      },
      decisions: [
        {
          kind: "client-specialization",
          name: "directCellText",
          applied: true,
          helper: "bindCellText",
          reason: "applied",
          source: { line: 4, column: expect.any(Number) },
        },
      ],
    });
    expect(report.generated.code).toContain("bindCellText(");
    expect(report.runtimeImports).toEqual(compiled.metadata.imports);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it("preserves reason codes for a generic path and does not alter emitted code", () => {
    const input = {
      code: [
        'import { cell } from "@reckona/mreact-reactive-core";',
        "export function App() {",
        '  const value = cell("a");',
        '  return <p>{value.get() + "!"}</p>;',
        "}",
      ].join("\n"),
      filename: "App.tsx",
      target: "client" as const,
      dev: false,
    };
    const report = explainTransform(input);

    expect(report.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "directCellText",
          applied: false,
          helper: "bindText",
          reason: "not-native-cell-read",
          source: { line: 4, column: expect.any(Number) },
        }),
      ]),
    );
    expect(report.generated.code).toBe(transform(input).code);
  });

  it("reports compiler diagnostics without inventing source coordinates", () => {
    const report = explainTransform({
      code: "export function App() { return <div ref={value} />; }",
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MR_UNSUPPORTED_REF_ATTRIBUTE",
          level: "error",
          source: expect.anything(),
        }),
      ]),
    );
    expect(
      report.diagnostics.find((item) => item.code === "MR_UNSUPPORTED_REF_ATTRIBUTE"),
    ).not.toHaveProperty("suggestion");

    const asyncReport = explainTransform({
      code: "export async function App() { return <p>Hello</p>; }",
      filename: "Async.tsx",
      target: "client",
      dev: false,
    });
    expect(asyncReport.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MR_ASYNC_COMPONENT_CLIENT_UNSUPPORTED", source: null }),
      ]),
    );

    const serverReport = explainTransform({
      code: "export function App() { return <button onClick={() => {}}>Go</button>; }",
      filename: "Server.tsx",
      target: "server",
      dev: false,
    });
    expect(serverReport.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
          suggestion: expect.objectContaining({ title: expect.any(String) }),
        }),
      ]),
    );
  });

  it("returns no reactive client decisions for server and compat transforms while populating compatLowering for compat client", () => {
    const serverReport = explainTransform({
      code: "export function App() { return <p>Hello</p>; }",
      filename: "App.tsx",
      target: "server",
      dev: false,
    });
    expect(serverReport.decisions).toEqual([]);
    expect(serverReport.compatLowering).toEqual([]);
    expect(serverReport.target).toBe("server");
    expect(serverReport.mode).toBe("reactive");

    const compatReport = explainTransform({
      code: "export function App(props: { label: string }) { return <p>{props.label}</p>; }",
      filename: "App.compat.tsx",
      target: "client",
      mode: "compat",
      dev: false,
    });
    expect(compatReport.decisions).toEqual([]);
    expect(compatReport.compatLowering).toEqual([
      expect.objectContaining({
        component: "App",
        path: "prop-reactive-dom-block",
        optimized: true,
        fallback: false,
        reasons: [],
      }),
    ]);
    expect(compatReport.target).toBe("client");
    expect(compatReport.mode).toBe("compat");
  });
});
