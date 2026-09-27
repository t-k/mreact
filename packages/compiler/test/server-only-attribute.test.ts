import { describe, expect, test } from "vitest";
import { analyzeToIr } from "../src/internal.js";
import { emitClosedDirectCellAttachRoute } from "../src/static-reactivity.js";
import {
  eraseServerOnlyTitleImport,
  isPureSingleStringExport,
} from "../src/server-only-attribute.js";

function routeIr(attribute: string, event = "count.set(value => value + 1)") {
  const analyzed = analyzeToIr({
    code: `import { cell } from "@reckona/mreact-reactive-core";
import { legalText } from "./legal-copy";
export const clientNavigation = false;
export default function Page() {
  const count = cell(0);
  return <button title={${attribute}} onClick={() => ${event}}>{count.get()}</button>;
}`,
    filename: "page.mreact.tsx",
    target: "client",
    options: {
      topLevelJsx: "diagnostic",
      bodyStatementJsx: "dom-node",
      awaitCompatComponents: "diagnostic",
    },
  });
  expect(analyzed.diagnostics).toEqual([]);
  return analyzed.ir;
}

describe("SSR-only imported attribute proof", () => {
  test("accepts one literal string export with no module initializer work", () => {
    expect(isPureSingleStringExport('export const legalText = "notice";', "legalText")).toBe(true);
    expect(
      isPureSingleStringExport('export const legalText: string = "notice";', "legalText"),
    ).toBe(true);
  });

  test.each([
    'globalThis.importRuns++; export const legalText = "notice";',
    'import "./register"; export const legalText = "notice";',
    "export const legalText = readNotice();",
    'export const legalText = { get value() { return "notice"; } };',
    "export const legalText = `notice`;",
    'export const legalText = "notice", other = 1;',
    'export let legalText = "notice";',
    'export { legalText } from "./other";',
    '"use client"; export const legalText = "notice";',
    'export const legalText = "notice"; globalThis.importRuns++;',
    'export const otherText = "notice";',
    "export const legalText = 12;",
    'export const { legalText } = { legalText: "notice" };',
    "",
  ])("rejects observable or unproven module evaluation: %s", (source) => {
    expect(isPureSingleStringExport(source, "legalText")).toBe(false);
  });

  test("removes only the exact title reference from the attach view", () => {
    const ir = routeIr("legalText");
    const erased = eraseServerOnlyTitleImport(
      ir,
      "legalText",
      'import { legalText } from "./legal-copy";',
    );
    expect(erased).toBeDefined();
    expect(ir.userImports).toHaveLength(2);
    expect(erased?.userImports).toHaveLength(1);
    const root = erased?.components[0]?.root;
    expect(root?.kind).toBe("element");
    if (root?.kind === "element") {
      expect(root.attributes[0]).toEqual({ kind: "static-attr", name: "title", value: "" });
    }
    expect(emitClosedDirectCellAttachRoute(erased!)).toContain("function __mreactAttachRoute");
  });

  test.each([
    ["legalText.toUpperCase()", "count.set(value => value + 1)"],
    ["legalText", "count.set(legalText.length)"],
    ["legalText + legalText", "count.set(value => value + 1)"],
  ])("keeps expressions that read the imported value on the client", (attribute, event) => {
    expect(
      eraseServerOnlyTitleImport(
        routeIr(attribute, event),
        "legalText",
        'import { legalText } from "./legal-copy";',
      ),
    ).toBeUndefined();
  });

  test("rejects a different attribute or a different binding", () => {
    const ir = routeIr("legalText");
    const component = ir.components[0]!;
    expect(component.root.kind).toBe("element");
    if (component.root.kind !== "element") return;

    const root = component.root;
    const title = root.attributes[0]!;
    expect(title.kind).toBe("dynamic-attr");
    if (title.kind !== "dynamic-attr") return;

    const withAttribute = (attribute: typeof title) => ({
      ...ir,
      components: [
        { ...component, root: { ...root, attributes: [attribute, ...root.attributes.slice(1)] } },
      ],
    });
    const remove = (input: typeof ir) =>
      eraseServerOnlyTitleImport(input, "legalText", 'import { legalText } from "./legal-copy";');

    expect(remove(withAttribute({ ...title, name: "aria-label" }))).toBeUndefined();
    expect(remove(withAttribute({ ...title, code: "otherText" }))).toBeUndefined();
    expect(remove(withAttribute({ ...title, serialization: "compat" }))).toBeUndefined();
    expect(remove(withAttribute({ ...title, omitServerRenderValue: true }))).toBeUndefined();
    expect(
      remove({ ...ir, components: [{ ...component, root: { ...root, keyCode: "legalText" } }] }),
    ).toBeUndefined();
    expect(
      remove({
        ...ir,
        components: [
          {
            ...component,
            root: { ...root, children: [...root.children, { kind: "expr", code: "legalText" }] },
          },
        ],
      }),
    ).toBeUndefined();
  });

  test("rejects an unproven import boundary", () => {
    const ir = routeIr("legalText");
    const remove = (input: typeof ir, statement = 'import { legalText } from "./legal-copy";') =>
      eraseServerOnlyTitleImport(input, "legalText", statement);
    expect(remove({ ...ir, userImports: ir.userImports.slice(0, 1) })).toBeUndefined();
    expect(
      remove({ ...ir, userImports: [...ir.userImports, 'import "./register";'] }),
    ).toBeUndefined();
    expect(remove(ir, 'import { otherText } from "./other";')).toBeUndefined();
    expect(remove({ ...ir, components: [...ir.components, ir.components[0]!] })).toBeUndefined();
  });

  test("keeps an imported dollar-prefixed alias referenced by the event handler", () => {
    const analyzed = analyzeToIr({
      code: `import { cell } from "@reckona/mreact-reactive-core";
import { legalText as $legalText } from "./legal-copy";
export const clientNavigation = false;
export default function Page() {
  const count = cell(0);
  return <button title={$legalText} onClick={() => count.set($legalText.length)}>{count.get()}</button>;
}`,
      filename: "page.mreact.tsx",
      target: "client",
      options: {
        topLevelJsx: "diagnostic",
        bodyStatementJsx: "dom-node",
        awaitCompatComponents: "diagnostic",
      },
    });
    expect(analyzed.diagnostics).toEqual([]);
    expect(
      eraseServerOnlyTitleImport(
        analyzed.ir,
        "$legalText",
        'import { legalText as $legalText } from "./legal-copy";',
      ),
    ).toBeUndefined();
  });
});
