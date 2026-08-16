// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { createElement, createRoot, useState } from "../src/index.js";
import {
  decodeFlightResponse,
  createFetchServerReferenceCaller,
  getReactFlightProtocolCoverage,
  hydrateFlightResponse,
  parseFlightResponse,
  readFlightResponse,
} from "../src/flight.js";

describe("react-compat Flight client", () => {
  test("preserves own __proto__ data without changing the decoded object prototype", () => {
    const response = parseFlightResponse(
      '0:{"name":"Ada","__proto__":{"isAdmin":true},"constructor":"own-constructor","prototype":"own-prototype"}',
    );
    const decoded = decodeFlightResponse(response, {
      loadClientReference: () => "div",
    }) as Record<string, unknown>;

    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
    expect(Object.hasOwn(decoded, "__proto__")).toBe(true);
    expect(decoded["__proto__"]).toEqual({ isAdmin: true });
    expect(Object.hasOwn(decoded, "constructor")).toBe(true);
    expect(Object.hasOwn(decoded, "prototype")).toBe(true);
    expect(decoded["constructor"]).toBe("own-constructor");
    expect(decoded["prototype"]).toBe("own-prototype");
    expect((decoded as { isAdmin?: boolean }).isAdmin).toBeUndefined();
    expect((Object.prototype as { isAdmin?: boolean }).isAdmin).toBeUndefined();
  });

  test("keeps high row references, symbols, and binary tags distinct", () => {
    const highReference = decodeFlightResponse(
      parseFlightResponse(['f0:{"name":"row-240"}', '0:{"value":"$f0"}'].join("\n")),
      { loadClientReference: () => "div" },
    ) as { value: unknown };
    const symbol = decodeFlightResponse(parseFlightResponse('0:"$Scafe"'), {
      loadClientReference: () => "div",
    });
    const binary = decodeFlightResponse(
      parseFlightResponse(['1:S2,AQI=', '0:"$1"'].join("\n")),
      { loadClientReference: () => "div" },
    );

    expect(highReference.value).toEqual({ name: "row-240" });
    expect(symbol).toBe(Symbol.for("cafe"));
    expect(binary).toBeInstanceOf(Int16Array);
    expect(Array.from(new Uint8Array((binary as Int16Array).buffer))).toEqual([1, 2]);
  });

  test("resolves hexadecimal boundary reference ids through runtime callbacks", () => {
    const serverRows = Array.from({ length: 255 }, (_, index) => {
      const id = index + 1;
      return `${id.toString(16)}:F${JSON.stringify({
        id: `actions/${id}#action${id}`,
        bound: null,
        name: `action${id}`,
      })}`;
    });
    serverRows.push('0:"$Fff"');
    const action = decodeFlightResponse(parseFlightResponse(serverRows.join("\n")), {
      loadClientReference: () => "div",
      callServerReference(reference) {
        return `${reference.moduleId}#${reference.exportName}`;
      },
    }) as () => unknown;

    const clientRows = Array.from({ length: 255 }, (_, index) => {
      const id = index + 1;
      return `${id.toString(16)}:I${JSON.stringify([
        `components/C${id}`,
        [],
        "default",
      ])}`;
    });
    clientRows.push('0:["$","$Lff",null,{}]');
    let loadedClientReference = "";
    decodeFlightResponse(parseFlightResponse(clientRows.join("\n")), {
      loadClientReference(reference) {
        loadedClientReference = `${reference.moduleId}#${reference.exportName}`;
        return () => null;
      },
    });

    expect(action()).toBe("actions/255#action255");
    expect(loadedClientReference).toBe("components/C255#default");
  });
  test("restores shared object identity from structured reference tables", () => {
    const decoded = decodeFlightResponse(
      {
        version: 1,
        clientReferences: [],
        serverReferences: [],
        objectReferences: [{ name: "Ada" }],
        root: {
          first: { kind: "object-reference", id: 0 },
          second: { kind: "object-reference", id: 0 },
        },
      },
      { loadClientReference: () => "div" },
    ) as { first: unknown; second: unknown };

    expect(decoded.first).toBe(decoded.second);
  });

  test("restores shared object identity from React Flight outline rows", () => {
    const decoded = decodeFlightResponse(
      parseFlightResponse(['1:{"name":"Ada"}', '0:{"first":"$1","second":"$1"}'].join("\n")),
      { loadClientReference: () => "div" },
    ) as { first: unknown; second: unknown };

    expect(decoded.first).toBe(decoded.second);
  });

  test("covers every declared React Flight row tag and model token", () => {
    expect(getReactFlightProtocolCoverage()).toEqual({
      binaryRowTags: ["A", "O", "o", "U", "S", "s", "L", "l", "G", "g", "M", "m", "V"],
      modelTokens: [
        "$",
        "$$",
        "$@",
        "$D",
        "$E",
        "$F",
        "$I",
        "$K",
        "$L",
        "$N",
        "$Q",
        "$S",
        "$W",
        "$Y",
        "$Z",
        "$i",
        "$n",
        "$u",
        "$undefined",
      ],
      rowTags: [
        "C",
        "D",
        "E",
        "F",
        "H",
        "I",
        "J",
        "N",
        "P",
        "R",
        "T",
        "W",
        "X",
        "x",
        "r",
      ],
    });
  });

  test("decodes client references into renderable compat elements", () => {
    function Card(props: { name: string }) {
      return createElement("p", null, props.name);
    }

    const node = decodeFlightResponse({
      version: 1,
      clientReferences: [
        {
          id: 0,
          moduleId: "./Card.client.tsx",
          exportName: "Card",
        },
      ],
      serverReferences: [],
      root: {
        kind: "element",
        type: {
          kind: "client-reference",
          id: 0,
        },
        key: null,
        props: {
          name: "Ada",
        },
      },
    }, {
      loadClientReference(reference) {
        expect(reference.moduleId).toBe("./Card.client.tsx");
        expect(reference.exportName).toBe("Card");
        return Card;
      },
    });
    const container = document.createElement("div");

    createRoot(container).render(node);

    expect(container.innerHTML).toBe("<p>Ada</p>");
  });

  test("parses and decodes React Flight wire rows", () => {
    function Card(props: { name: string; onSave: () => unknown }) {
      return createElement("button", { onClick: () => props.onSave() }, props.name);
    }
    const calls: unknown[][] = [];
    const node = decodeFlightResponse(
      parseFlightResponse(
        [
          '1:I["./Card.client.tsx",["/assets/Card.client.js"],"Card"]',
          '2:F{"id":"actions/save#save","bound":null,"name":"save"}',
          '0:["$","$L1",null,{"name":"Ada","onSave":"$F2"}]',
        ].join("\n"),
      ),
      {
        loadClientReference(reference) {
          expect(reference).toEqual({
            id: 1,
            moduleId: "./Card.client.tsx",
            exportName: "Card",
            chunks: ["/assets/Card.client.js"],
          });
          return Card;
        },
        callServerReference(reference, args) {
          calls.push([reference.moduleId, reference.exportName, ...args]);
        },
      },
    );
    const container = document.createElement("div");

    createRoot(container).render(node);
    container.querySelector("button")?.click();

    expect(container.innerHTML).toBe("<button>Ada</button>");
    expect(calls).toEqual([["actions/save", "save"]]);
  });

  test("prepends bound server reference arguments when invoking action stubs", () => {
    function Card(props: { onSave: (name: string) => unknown }) {
      return createElement("button", { onClick: () => props.onSave("Ada") }, "Save");
    }
    const calls: unknown[][] = [];
    const node = decodeFlightResponse(
      parseFlightResponse(
        [
          '1:I["./Card.client.tsx",[],"Card"]',
          '2:F{"id":"actions/save#save","bound":["workspace-1"],"name":"save"}',
          '0:["$","$L1",null,{"onSave":"$F2"}]',
        ].join("\n"),
      ),
      {
        loadClientReference() {
          return Card;
        },
        callServerReference(reference, args) {
          calls.push([reference.moduleId, reference.exportName, ...args]);
        },
      },
    );
    const container = document.createElement("div");

    createRoot(container).render(node);
    container.querySelector("button")?.click();

    expect(calls).toEqual([["actions/save", "save", "workspace-1", "Ada"]]);
  });

  test("decodes outlined bound server reference arguments before invocation", () => {
    function Card(props: { onSave: (name: string) => unknown }) {
      return createElement("button", { onClick: () => props.onSave("Ada") }, "Save");
    }
    const calls: unknown[][] = [];
    const node = decodeFlightResponse(
      parseFlightResponse(
        [
          '1:I["./Card.client.tsx",[],"Card"]',
          '3:[["workspace","workspace-1"]]',
          '2:F{"id":"actions/save#save","bound":["$Q3"],"name":"save"}',
          '0:["$","$L1",null,{"onSave":"$F2"}]',
        ].join("\n"),
      ),
      {
        loadClientReference() {
          return Card;
        },
        callServerReference(reference, args) {
          calls.push([reference.moduleId, reference.exportName, ...args]);
        },
      },
    );
    const container = document.createElement("div");

    createRoot(container).render(node);
    container.querySelector("button")?.click();

    const call = calls[0];

    expect(call?.[0]).toBe("actions/save");
    expect(call?.[1]).toBe("save");
    expect(call?.[2]).toBeInstanceOf(Map);
    expect((call?.[2] as Map<string, string> | undefined)?.get("workspace")).toBe("workspace-1");
    expect(call?.[3]).toBe("Ada");
  });

  test("parses React 19 Flight outlined text chunks and scalar props", () => {
    const seen: Record<string, unknown> = {};
    function Card(props: Record<string, unknown>) {
      Object.assign(seen, props);
      return createElement("p", null, props.children);
    }
    const node = decodeFlightResponse(
      parseFlightResponse(
        [
          ":N123.4",
          "1:T9,Hello Ada",
          '2:[["answer",42]]',
          '3:["red","blue"]',
          'a:I["./Card.client.tsx",[],"Card"]',
          '0:["$","$La",null,{"children":"$1","when":"$D2026-05-11T00:00:00.000Z","total":"$n123","inf":"$I","negZero":"$-0","nan":"$N","missing":"$u","map":"$Q2","set":"$W3"}]',
        ].join("\n"),
      ),
      {
        loadClientReference(reference) {
          expect(reference.moduleId).toBe("./Card.client.tsx");
          return Card;
        },
      },
    );
    const container = document.createElement("div");

    createRoot(container).render(node);

    expect(container.innerHTML).toBe("<p>Hello Ada</p>");
    expect(seen.when).toEqual(new Date("2026-05-11T00:00:00.000Z"));
    expect(seen.total).toBe(123n);
    expect(seen.inf).toBe(Infinity);
    expect(Object.is(seen.negZero, -0)).toBe(true);
    expect(Number.isNaN(seen.nan)).toBe(true);
    expect(seen.missing).toBeUndefined();
    expect(seen.map).toEqual(new Map([["answer", 42]]));
    expect(seen.set).toEqual(new Set(["red", "blue"]));
  });

  test("decodes React Flight FormData and iterable model tokens", () => {
    const seen: Record<string, unknown> = {};
    function Card(props: Record<string, unknown>) {
      Object.assign(seen, props);
      return createElement("p", null, "ok");
    }
    const node = decodeFlightResponse(
      parseFlightResponse(
        [
          '1:I["./Card.client.tsx",[],"Card"]',
          '2:[["name","Ada"],["file","Lovelace"]]',
          '3:["red","blue"]',
          '0:["$","$L1",null,{"form":"$K2","items":"$i3","taint":"$Y"}]',
        ].join("\n"),
      ),
      {
        loadClientReference() {
          return Card;
        },
      },
    );
    const container = document.createElement("div");

    createRoot(container).render(node);

    expect(container.innerHTML).toBe("<p>ok</p>");
    expect(seen.form).toBeInstanceOf(FormData);
    expect((seen.form as FormData).get("name")).toBe("Ada");
    expect((seen.form as FormData).get("file")).toBe("Lovelace");
    expect(seen.items).toEqual(["red", "blue"]);
    expect(seen.taint).toBeUndefined();
  });

  test("throws on unsupported React Flight row tags instead of ignoring them", () => {
    expect(() => parseFlightResponse("1:Z{}")).toThrow("Unsupported React Flight row tag: Z");
  });


  test("decodes React Flight textual binary chunks into ArrayBuffer and typed arrays", () => {
    const seen: Record<string, unknown> = {};
    function Card(props: Record<string, unknown>) {
      Object.assign(seen, props);
      return createElement("p", null, String((props.bytes as Uint8Array)[1]));
    }
    const node = decodeFlightResponse(
      parseFlightResponse(
        [
          "1:o4,AQIDBA==",
          "2:A4,AQIDBA==",
          "3:s4,AQACAA==",
          "4:V4,AQIDBA==",
          "6:S4,AQACAA==",
          "7:L4,AQAAAA==",
          '5:I["./Card.client.tsx",[],"Card"]',
          '0:["$","$L5",null,{"bytes":"$1","buffer":"$2","words":"$3","view":"$4","signedWords":"$6","signedLongs":"$7"}]',
        ].join("\n"),
      ),
      {
        loadClientReference() {
          return Card;
        },
      },
    );
    const container = document.createElement("div");

    createRoot(container).render(node);

    expect(container.innerHTML).toBe("<p>2</p>");
    expect(seen.bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(seen.buffer).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(seen.buffer as ArrayBuffer))).toEqual([1, 2, 3, 4]);
    expect(seen.words).toEqual(new Uint16Array([1, 2]));
    expect(seen.view).toBeInstanceOf(DataView);
    expect((seen.view as DataView).getUint8(2)).toBe(3);
    expect(seen.signedWords).toEqual(new Int16Array([1, 2]));
    expect(seen.signedLongs).toEqual(new Int32Array([1]));
  });

  test("parses React Flight raw binary rows without corrupting typed array payloads", () => {
    const seen: Record<string, unknown> = {};
    function Card(props: Record<string, unknown>) {
      Object.assign(seen, props);
      return createElement("p", null, String((props.bytes as Uint8Array)[3]));
    }
    const encoder = new TextEncoder();
    const payload = concatBytes(
      encoder.encode("1:o4,"),
      new Uint8Array([1, 2, 3, 4]),
      encoder.encode('\n2:I["./Card.client.tsx",[],"Card"]\n'),
      encoder.encode('0:["$","$L2",null,{"bytes":"$1"}]\n'),
    );
    const node = decodeFlightResponse(parseFlightResponse(payload), {
      loadClientReference() {
        return Card;
      },
    });
    const container = document.createElement("div");

    createRoot(container).render(node);

    expect(container.innerHTML).toBe("<p>4</p>");
    expect(seen.bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  test("throws decoded React Flight root errors", () => {
    const response = parseFlightResponse(
      '0:E{"digest":"digest-1","name":"Error","message":"boom","stack":[],"env":"Server"}',
    );

    expect(() =>
      decodeFlightResponse(response, {
        loadClientReference() {
          throw new Error("unexpected client reference");
        },
      }),
    ).toThrow("boom");
  });

  test("decodes server references into callable action stubs", async () => {
    const calls: unknown[][] = [];
    const node = decodeFlightResponse(
      parseFlightResponse(
        JSON.stringify({
          version: 1,
          clientReferences: [
            {
              id: 0,
              moduleId: "./Button.client.tsx",
              exportName: "Button",
            },
          ],
          serverReferences: [
            {
              id: 0,
              moduleId: "actions/save",
              exportName: "save",
            },
          ],
          root: {
            kind: "element",
            type: {
              kind: "client-reference",
              id: 0,
            },
            key: null,
            props: {
              onSave: {
                kind: "server-reference",
                id: 0,
              },
            },
          },
        }),
      ),
      {
        loadClientReference() {
          return (props: { onSave: (value: string) => Promise<unknown> }) =>
            createElement("button", { onClick: () => props.onSave("Ada") }, "Save");
        },
        callServerReference(reference, args) {
          calls.push([reference.moduleId, reference.exportName, ...args]);
          return Promise.resolve({ ok: true });
        },
      },
    );
    const container = document.createElement("div");

    createRoot(container).render(node);
    container.querySelector("button")?.click();
    await Promise.resolve();

    expect(calls).toEqual([["actions/save", "save", "Ada"]]);
  });

  test("reads embedded Flight script and hydrates decoded content", () => {
    function Card(props: { name: string }) {
      return createElement("p", null, props.name);
    }
    const container = document.createElement("div");
    const script = document.createElement("script");

    script.type = "application/json";
    script.id = "flight-root";
    script.setAttribute("data-mreact-flight", "");
    script.textContent = JSON.stringify({
      version: 1,
      clientReferences: [{ id: 0, moduleId: "./Card.client.tsx", exportName: "Card" }],
      serverReferences: [],
      root: {
        kind: "element",
        type: { kind: "client-reference", id: 0 },
        key: null,
        props: { name: "Ada" },
      },
    });
    document.body.append(script);

    const response = readFlightResponse(document, "flight-root");
    hydrateFlightResponse(container, response, {
      loadClientReference: () => Card,
    });

    expect(container.innerHTML).toBe("<p>Ada</p>");
    script.remove();
  });

  test("hydrates decoded Flight content through hydrateRoot without replacing matching DOM", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>Ada</p>";
    const existingParagraph = container.querySelector("p");

    hydrateFlightResponse(
      container,
      {
        version: 1,
        clientReferences: [],
        serverReferences: [],
        root: {
          kind: "element",
          type: "p",
          key: null,
          props: { children: "Ada" },
        },
      },
      {
        loadClientReference() {
          throw new Error("unexpected client reference");
        },
      },
    );

    expect(container.querySelector("p")).toBe(existingParagraph);
  });

  test("hydrates Flight client references inside a resume marker scope", () => {
    const container = document.createElement("div");
    container.innerHTML =
      "<span>outside</span><!--mreact-h:start:flight-root--><button>Ada 0</button><!--mreact-h:end:flight-root-->";
    const outside = container.querySelector("span");
    const serverButton = container.querySelector("button");

    function Button(props: { name: string }) {
      const [count, setCount] = useState(0);
      return createElement(
        "button",
        { onClick: () => setCount((value) => value + 1) },
        `${props.name} ${count}`,
      );
    }

    hydrateFlightResponse(
      container,
      {
        version: 1,
        clientReferences: [
          {
            id: 0,
            moduleId: "./Button.client.tsx",
            exportName: "Button",
          },
        ],
        serverReferences: [],
        root: {
          kind: "element",
          type: { kind: "client-reference", id: 0 },
          key: null,
          props: { name: "Ada" },
        },
      },
      {
        hydrate: { resumeId: "flight-root", consumeResumeMarkers: true },
        loadClientReference(reference) {
          expect(reference.moduleId).toBe("./Button.client.tsx");
          return Button;
        },
      },
    );

    expect(container.querySelector("span")).toBe(outside);
    expect(container.querySelector("button")).toBe(serverButton);
    container.querySelector("button")?.click();
    expect(container.querySelector("button")?.textContent).toBe("Ada 1");
    container.querySelector("button")?.click();
    expect(container.querySelector("button")?.textContent).toBe("Ada 2");
    expect(container.querySelector("span")).toBe(outside);
    expect(container.innerHTML).toBe(
      "<span>outside</span><button>Ada 2</button>",
    );
  });

  test("creates fetch-backed server reference caller", async () => {
    const requests: unknown[] = [];
    const callServerReference = createFetchServerReferenceCaller("/_mreact/action", {
      fetch(input, init) {
        requests.push([input, init?.method, init?.body]);
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, value: "saved" }), {
            headers: { "content-type": "application/json" },
          }),
        );
      },
    });

    await expect(
      callServerReference({ id: 0, moduleId: "actions/save", exportName: "save" }, ["Ada"]),
    ).resolves.toBe("saved");
    expect(requests).toEqual([
      [
        "/_mreact/action",
        "POST",
        JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: ["Ada"],
        }),
      ],
    ]);
  });

  test("sends CSRF token and nonce headers from fetch-backed server reference caller", async () => {
    const requests: unknown[] = [];
    const callServerReference = createFetchServerReferenceCaller("/_mreact/action", {
      csrfToken: () => "csrf-1",
      nonce: () => "nonce-1",
      fetch(_input, init) {
        requests.push(init?.headers);
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, value: "saved" }), {
            headers: { "content-type": "application/json" },
          }),
        );
      },
    });

    await callServerReference({ id: 0, moduleId: "actions/save", exportName: "save" }, []);

    expect(requests).toEqual([
      {
        "content-type": "application/json",
        "x-mreact-action-nonce": "nonce-1",
        "x-mreact-csrf": "csrf-1",
      },
    ]);
  });

  test("sends bound server reference args and same-origin credentials from fetch caller", async () => {
    const requests: RequestInit[] = [];
    const callServerReference = createFetchServerReferenceCaller("/_mreact/action", {
      csrfToken: "csrf-1",
      nonce: "nonce-1",
      fetch(_input, init) {
        requests.push(init ?? {});
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, value: "saved" }), {
            headers: { "content-type": "application/json" },
          }),
        );
      },
    });

    await callServerReference(
      {
        id: 0,
        moduleId: "actions/save",
        exportName: "save",
        bound: ["workspace-1"],
      },
      ["Ada"],
    );

    expect(requests).toEqual([
      expect.objectContaining({
        credentials: "same-origin",
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          bound: ["workspace-1"],
          args: ["Ada"],
        }),
      }),
    ]);
  });
});

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}
