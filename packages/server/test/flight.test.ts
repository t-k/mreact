import { describe, expect, test } from "vitest";
import { createElement } from "@modular-react/react-compat";
import {
  createFlightClientManifest,
  createClientReference,
  createServerReference,
  createServerActionHandler,
  renderToFlightResponse,
  renderFlightResponseScript,
  stringifyFlightResponse,
  toReactFlightRows,
  fromReactFlightRows,
} from "../src/index.js";

describe("server Flight runtime", () => {
  test("renders async server components into a serializable Flight model", async () => {
    async function Greeting(props: { name: string }) {
      await Promise.resolve();
      return createElement("strong", null, `Hello ${props.name}`);
    }

    function App() {
      return createElement("section", null, createElement(Greeting, { name: "Ada" }));
    }

    const response = await renderToFlightResponse(App);

    expect(response).toEqual({
      version: 1,
      root: {
        kind: "element",
        type: "section",
        key: null,
        props: {
          children: {
            kind: "element",
            type: "strong",
            key: null,
            props: {
              children: "Hello Ada",
            },
          },
        },
      },
      clientReferences: [],
      serverReferences: [],
    });
    expect(JSON.parse(stringifyFlightResponse(response))).toEqual(response);
  });

  test("keeps client references as module references instead of executing them", async () => {
    const ClientCard = createClientReference("./Card.client.tsx", "Card", [
      "/assets/Card.client.js",
    ]);

    function App() {
      return createElement("main", null, createElement(ClientCard, { name: "Ada" }));
    }

    const response = await renderToFlightResponse(App);

    expect(response.clientReferences).toEqual([
      {
        id: 0,
        moduleId: "./Card.client.tsx",
        exportName: "Card",
        chunks: ["/assets/Card.client.js"],
      },
    ]);
    expect(response.root).toEqual({
      kind: "element",
      type: "main",
      key: null,
      props: {
        children: {
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
      },
    });
  });

  test("serializes server action references in client component props", async () => {
    const ClientButton = createClientReference("./Button.client.tsx", "Button");
    const save = createServerReference("actions/save", "save");

    function App() {
      return createElement(ClientButton, { onSave: save });
    }

    const response = await renderToFlightResponse(App);

    expect(response.serverReferences).toEqual([
      {
        id: 0,
        moduleId: "actions/save",
        exportName: "save",
      },
    ]);
    expect(response.root).toEqual({
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
    });
  });

  test("renders a CSP-safe Flight response script for HTML streaming integration", async () => {
    const response = await renderToFlightResponse(createElement("p", null, "Ada"));

    expect(renderFlightResponseScript(response, { id: "flight:root", nonce: "nonce-1" })).toBe(
      '<script type="application/json" data-mreact-flight id="flight:root" nonce="nonce-1">{"version":1,"root":{"kind":"element","type":"p","key":null,"props":{"children":"Ada"}},"clientReferences":[],"serverReferences":[]}</script>',
    );
    expect(renderFlightResponseScript({ ...response, root: "<tag>" })).toContain("\\u003c");
  });

  test("handles server action POST requests with JSON arguments", async () => {
    const handle = createServerActionHandler({
      "actions/save#save": async (name: string) => ({ ok: true, name }),
    });
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: ["Ada"],
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      value: { ok: true, name: "Ada" },
    });
  });

  test("converts the modular Flight response to and from React row adapter format", async () => {
    const response = await renderToFlightResponse(createElement("p", null, "Ada"));
    const rows = toReactFlightRows(response);

    expect(rows).toContain("M0:");
    expect(rows).toContain("J0:");
    expect(fromReactFlightRows(rows)).toEqual(response);
  });

  test("creates a client manifest from compiler metadata and chunk resolver", () => {
    expect(
      createFlightClientManifest(
        [
          {
            name: "Card",
            moduleId: "./Card.client.tsx",
            exportName: "Card",
          },
        ],
        (reference) => [`/assets/${reference.name}.js`],
      ),
    ).toEqual([
      {
        name: "Card",
        moduleId: "./Card.client.tsx",
        exportName: "Card",
        chunks: ["/assets/Card.js"],
      },
    ]);
  });
});
