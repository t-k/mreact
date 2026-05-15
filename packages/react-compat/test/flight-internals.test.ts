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
        serverReferences: [
          { id: 1, moduleId: "/actions.js", exportName: "save", bound: ["Ada"] },
        ],
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
        clientReferences: [
          { id: 1, moduleId: "/client.js", chunks: [], exportName: "Button" },
        ],
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
