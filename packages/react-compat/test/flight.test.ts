// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { createElement, createRoot } from "../src/index.js";
import {
  decodeFlightResponse,
  createFetchServerReferenceCaller,
  hydrateFlightResponse,
  parseFlightResponse,
  readFlightResponse,
} from "../src/flight.js";

describe("react-compat Flight client", () => {
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
});
