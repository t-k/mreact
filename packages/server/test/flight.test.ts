import { describe, expect, test } from "vitest";
import { createElement } from "@modular-react/react-compat";
import {
  createClientReference,
  createServerReference,
  renderToFlightResponse,
  stringifyFlightResponse,
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
});
