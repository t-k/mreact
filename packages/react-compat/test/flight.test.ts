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
});
