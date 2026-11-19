import { parseSync } from "oxc-parser";
import { describe, expect, test } from "vitest";
import { collectOxcClientBoundaryImportComponents } from "../src/oxc-component-references.js";

describe("client boundary import aliases", () => {
  test("skips walking statement bodies when there are no boundary bindings", () => {
    const statement = {
      type: "ExpressionStatement",
      get expression() {
        throw new Error("unnecessary alias traversal");
      },
    };

    expect(collectOxcClientBoundaryImportComponents({ body: [statement] }, new Set())).toEqual(
      new Map(),
    );
  });

  test("still visits aliases when a client namespace import supplies a binding", () => {
    const { program, errors } = parseSync(
      "entry.tsx",
      'import * as Widgets from "./widgets.client.tsx"; const Badge = Widgets.Badge;',
    );

    expect(errors).toEqual([]);
    expect(collectOxcClientBoundaryImportComponents(program, new Set()).get("Badge")).toEqual({
      moduleId: "./widgets.client.tsx",
      exportName: "Badge",
    });
  });
});
