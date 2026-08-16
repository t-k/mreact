import { describe, expect, test } from "vitest";
import { parseReactFlightPayload } from "../src/flight-parser.js";
import { decodeFlightModel } from "../src/flight-decoder.js";
import { decodeFlightElementModel } from "../src/flight-element-builder.js";

describe("react-compat Flight internals", () => {
  test("parser converts React Flight rows into a typed response model", () => {
    const response = parseReactFlightPayload(
      [
        '1:I["/client.js",["chunk.js"],"Button"]',
        '2:F{"id":"/actions.js#save","bound":["Ada"]}',
        '0:["$","$L1",null,{"action":"$F2","children":"Ship"}]',
      ].join("\n"),
    );

    expect(response.clientReferences).toEqual([
      { id: 1, moduleId: "/client.js", chunks: ["chunk.js"], exportName: "Button" },
    ]);
    expect(response.serverReferences).toEqual([
      { id: 2, moduleId: "/actions.js", exportName: "save", bound: ["Ada"] },
    ]);
    expect(response.root).toEqual({
      kind: "element",
      type: { kind: "client-reference", id: 1 },
      key: null,
      props: {
        action: { kind: "server-reference", id: 2 },
        children: "Ship",
      },
    });
  });

  test("decoder builds runtime values from typed Flight models", () => {
    const callArgs: unknown[][] = [];
    const action = decodeFlightModel(
      { kind: "server-reference", id: 1 },
      {
        version: 1,
        root: { kind: "server-reference", id: 1 },
        clientReferences: [],
        serverReferences: [{ id: 1, moduleId: "/actions.js", exportName: "save", bound: ["Ada"] }],
      },
      {
        loadClientReference() {
          throw new Error("unexpected client reference");
        },
        callServerReference(reference, args) {
          callArgs.push([reference.moduleId, reference.exportName, ...args]);
          return "ok";
        },
      },
    ) as (value: string) => unknown;

    expect(action("Lovelace")).toBe("ok");
    expect(callArgs).toEqual([["/actions.js", "save", "Ada", "Lovelace"]]);
  });

  test("decoder materializes __proto__ as an own data property", () => {
    const model = JSON.parse('{"__proto__":{"isAdmin":true}}') as Record<string, unknown>;
    const decoded = decodeFlightModel(
      model,
      {
        version: 1,
        root: model,
        clientReferences: [],
        serverReferences: [],
      },
      {
        loadClientReference() {
          throw new Error("unexpected client reference");
        },
      },
    ) as Record<string, unknown>;

    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
    expect(Object.hasOwn(decoded, "__proto__")).toBe(true);
    expect(decoded["__proto__"]).toEqual({ isAdmin: true });
    expect((decoded as { isAdmin?: boolean }).isAdmin).toBeUndefined();
  });

  test.each([
    [{ kind: "regexp", source: "(", flags: "", lastIndex: 0 }, /regular expression/i],
    [{ kind: "regexp", source: "Ada", flags: "gg", lastIndex: 0 }, /flags/i],
    [{ kind: "regexp", source: "Ada", flags: "", lastIndex: -1 }, /lastIndex/i],
    [{ kind: "regexp", source: "Ada", flags: "", lastIndex: 1.5 }, /lastIndex/i],
    [{ kind: "regexp", source: "Ada", flags: "", lastIndex: Infinity }, /lastIndex/i],
    [{ kind: "regexp", source: "Ada", flags: "", lastIndex: "1" }, /lastIndex/i],
    [{ kind: "regexp", source: 1, flags: "", lastIndex: 0 }, /regexp/i],
    [{ kind: "regexp", source: "Ada", flags: 1, lastIndex: 0 }, /regexp/i],
    [{ kind: "url", href: "https://[" }, /url/i],
    [{ kind: "url", href: 1 }, /url/i],
  ] as const)("rejects malformed extension model %#", (model, expected) => {
    expect(() =>
      decodeFlightModel(
        model as never,
        {
          version: 1,
          root: model as never,
          clientReferences: [],
          serverReferences: [],
        },
        { loadClientReference: () => "div" },
      ),
    ).toThrow(expected);
  });

  test("element builder resolves client references and decodes props", () => {
    const Button = () => null;
    const node = decodeFlightElementModel(
      {
        kind: "element",
        type: { kind: "client-reference", id: 1 },
        key: "primary",
        props: { children: "Ship" },
      },
      {
        version: 1,
        root: { kind: "undefined" },
        clientReferences: [{ id: 1, moduleId: "/client.js", chunks: [], exportName: "Button" }],
        serverReferences: [],
      },
      {
        loadClientReference(reference) {
          expect(reference.exportName).toBe("Button");
          return Button;
        },
      },
      (model) => model,
    );

    expect(node).toMatchObject({
      type: Button,
      key: "primary",
      props: { children: "Ship" },
    });
  });
});
