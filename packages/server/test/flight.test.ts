import { createHook } from "node:async_hooks";
import { describe, expect, test } from "vitest";
import { cache, cacheSignal, createElement } from "@reckona/mreact-compat";
import {
  createFlightClientManifest,
  createClientReference,
  createServerReference,
  createServerActionHandler,
  getReactFlightProtocolCoverage,
  mergeReactFlightRows,
  renderFlightPreloadLinks,
  renderToFlightResponse,
  renderFlightResponseScript,
  stringifyFlightResponse,
  toReactFlightRows,
  fromReactFlightRows,
  type FlightResponse,
} from "../src/index.js";

describe("server Flight runtime", () => {
  test("declares complete React Flight row and model token coverage", () => {
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
      rowTags: ["C", "D", "E", "F", "H", "I", "J", "N", "P", "R", "T", "W", "X", "x", "r"],
    });
  });

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

  test("does not read then from primitive Flight leaves", async () => {
    const primitive = "Ada";
    let thenReads = 0;
    Object.defineProperty(String.prototype, "then", {
      configurable: true,
      get() {
        thenReads += 1;
        return undefined;
      },
    });

    try {
      const response = await renderToFlightResponse({ name: primitive });

      expect(response.root).toEqual({ name: "Ada" });
      expect(thenReads).toBe(0);
    } finally {
      delete (String.prototype as { then?: unknown }).then;
    }
  });

  test("serializes every TypedArray using its visible byte range", async () => {
    const cases: Array<{ name: string; value: ArrayBufferView }> = [
      { name: "Int8Array", value: new Int8Array([-1, 2]) },
      { name: "Uint8Array", value: new Uint8Array([1, 2]) },
      { name: "Uint8ClampedArray", value: new Uint8ClampedArray([1, 255]) },
      { name: "Int16Array", value: new Int16Array([-1, 2]) },
      { name: "Uint16Array", value: new Uint16Array([1, 2]) },
      { name: "Int32Array", value: new Int32Array([-1, 2]) },
      { name: "Uint32Array", value: new Uint32Array([1, 2]) },
      { name: "Float32Array", value: new Float32Array([1.5, -2.25]) },
      { name: "Float64Array", value: new Float64Array([1.5, -2.25]) },
      { name: "BigInt64Array", value: new BigInt64Array([-1n, 2n]) },
      { name: "BigUint64Array", value: new BigUint64Array([1n, 2n]) },
    ];

    for (const { name, value } of cases) {
      const response = await renderToFlightResponse(value);
      const bytes = Array.from(
        new Uint8Array(value.buffer as ArrayBuffer, value.byteOffset, value.byteLength),
      );

      expect(response.root, name).toEqual({
        kind: "typed-array",
        arrayType: name,
        bytes,
      });
    }
  });

  test("serializes ArrayBuffer and offset views without adjacent backing bytes", async () => {
    const backing = new Uint8Array([99, 1, 2, 3, 4, 88]);
    const response = await renderToFlightResponse({
      buffer: backing.buffer.slice(1, 5),
      bytes: new Uint8Array(backing.buffer, 1, 4),
      view: new DataView(backing.buffer, 1, 4),
    });

    expect(response.root).toEqual({
      buffer: { kind: "array-buffer", bytes: [1, 2, 3, 4] },
      bytes: { kind: "typed-array", arrayType: "Uint8Array", bytes: [1, 2, 3, 4] },
      view: { kind: "data-view", bytes: [1, 2, 3, 4] },
    });
  });

  test("serializes RegExp and URL extension models with shared identity", async () => {
    const pattern = /\$F1/giu;
    pattern.lastIndex = 3;
    const url = new URL("https://example.test/a?b=1");
    const response = await renderToFlightResponse({ pattern, patternAgain: pattern, url, urlAgain: url });

    expect(response.objectReferences).toEqual([
      { kind: "regexp", source: "\\$F1", flags: "giu", lastIndex: 3 },
      { kind: "url", href: "https://example.test/a?b=1" },
    ]);
    expect(response.root).toEqual({
      pattern: { kind: "object-reference", id: 0 },
      patternAgain: { kind: "object-reference", id: 0 },
      url: { kind: "object-reference", id: 1 },
      urlAgain: { kind: "object-reference", id: 1 },
    });
  });

  test("rejects unsupported Flight objects instead of flattening them", async () => {
    class UnsupportedValue {}

    await expect(renderToFlightResponse(new WeakMap())).rejects.toThrow(
      /Unsupported Flight object/,
    );
    await expect(renderToFlightResponse(new WeakSet())).rejects.toThrow(
      /Unsupported Flight object/,
    );
    await expect(renderToFlightResponse(new UnsupportedValue())).rejects.toThrow(
      /Unsupported Flight object/,
    );
    if (typeof SharedArrayBuffer !== "undefined") {
      await expect(renderToFlightResponse(new SharedArrayBuffer(4))).rejects.toThrow(
        /Unsupported Flight object/,
      );
    }
  });

  test("serializes primitive arrays without one promise hop per leaf", async () => {
    const values = Array.from({ length: 100 }, (_unused, index) => index);
    let promiseInits = 0;
    const hook = createHook({
      init(_asyncId, type) {
        if (type === "PROMISE") {
          promiseInits += 1;
        }
      },
    });

    hook.enable();
    try {
      await renderToFlightResponse(values);
    } finally {
      hook.disable();
    }

    expect(promiseInits).toBeLessThan(320);
  });

  test("serializes nested plain data without one promise hop per node", async () => {
    const buildTree = (depth: number): unknown =>
      depth === 0
        ? "leaf"
        : Object.fromEntries(
            Array.from({ length: 4 }, (_unused, index) => [`k${index}`, buildTree(depth - 1)]),
          );
    let promiseInits = 0;
    const hook = createHook({
      init(_asyncId, type) {
        if (type === "PROMISE") {
          promiseInits += 1;
        }
      },
    });

    hook.enable();
    try {
      await renderToFlightResponse(buildTree(5));
    } finally {
      hook.disable();
    }

    expect(promiseInits).toBeLessThan(500);
  });

  test("serializes a deeply shared acyclic graph once per distinct object", async () => {
    let node: Record<string, unknown> = { leaf: 1 };

    for (let depth = 0; depth < 40; depth += 1) {
      node = { a: node, b: node };
    }

    const response = await renderToFlightResponse(node);
    const payload = stringifyFlightResponse(response);

    expect(response.objectReferences).toHaveLength(40);
    expect(payload.length).toBeLessThan(10_000);
    expect(payload.match(/"kind":"object-reference"/g)).toHaveLength(80);

    const roundTripped = fromReactFlightRows(toReactFlightRows(response));
    const roundTrippedRoot = roundTripped.root as { a: unknown; b: unknown };
    expect(roundTrippedRoot.a).toBe(roundTrippedRoot.b);
  });

  test("rejects cyclic Flight values with a catchable error", async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    await expect(renderToFlightResponse(cyclic)).rejects.toThrow(/MR_FLIGHT_CYCLE/);
  });

  test("rejects cyclic server reference bound values with a catchable error", async () => {
    const selfBound = createServerReference("actions/save", "save", []);
    selfBound.bound?.push(selfBound);
    const first = createServerReference("actions/first", "first", []);
    const second = createServerReference("actions/second", "second", [first]);
    first.bound?.push(second);

    await expect(renderToFlightResponse(selfBound)).rejects.toThrow(/MR_FLIGHT_CYCLE/);
    await expect(renderToFlightResponse(first)).rejects.toThrow(/MR_FLIGHT_CYCLE/);
  });

  test("uses one cache scope while rendering a Flight response", async () => {
    let calls = 0;
    const read = cache((name: string) => {
      calls += 1;
      return `${name}:${calls}`;
    });

    function App() {
      return createElement("p", null, `${read("Ada")}/${read("Ada")}`);
    }

    const response = await renderToFlightResponse(App);

    expect(response.root).toEqual({
      kind: "element",
      type: "p",
      key: null,
      props: {
        children: "Ada:1/Ada:1",
      },
    });
    expect(calls).toBe(1);
  });

  test("keeps concurrent Flight cache scopes isolated across async components", async () => {
    const releaseA = createDeferred<void>();
    const bStarted = createDeferred<void>();
    const releaseB = createDeferred<void>();

    async function App(props: { name: string }) {
      if (props.name === "A") {
        await releaseA.promise;
      } else {
        bStarted.resolve();
        await releaseB.promise;
      }
      return createElement("p", null, cacheSignal()?.aborted === false ? props.name : "missing");
    }

    const a = renderToFlightResponse(App, { name: "A" });
    const b = renderToFlightResponse(App, { name: "B" });
    await bStarted.promise;

    releaseA.resolve();
    await expect(a).resolves.toMatchObject({
      root: {
        props: {
          children: "A",
        },
      },
    });

    releaseB.resolve();
    await expect(b).resolves.toMatchObject({
      root: {
        props: {
          children: "B",
        },
      },
    });
  });

  test("rejects deeply nested Flight encode values with a bounded error", async () => {
    let nestedArray: unknown = "leaf";
    let nestedObject: unknown = "leaf";

    for (let index = 0; index < 300; index += 1) {
      nestedArray = [nestedArray];
      nestedObject = { child: nestedObject };
    }

    await expect(renderToFlightResponse(nestedArray)).rejects.toThrow(/MR_FLIGHT_TOO_DEEP/);
    await expect(renderToFlightResponse(nestedObject)).rejects.toThrow(/MR_FLIGHT_TOO_DEEP/);
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

  test("serializes bound server action arguments and prepends them on invocation", async () => {
    const ClientButton = createClientReference("./Button.client.tsx", "Button");
    const save = createServerReference("actions/save", "save", ["workspace-1"]);
    const calls: unknown[][] = [];
    const response = await renderToFlightResponse(createElement(ClientButton, { onSave: save }));
    const rows = toReactFlightRows(response);

    expect(rows.split("\n")).toContain(
      '2:F{"id":"actions/save#save","bound":["workspace-1"],"name":"save"}',
    );
    expect(fromReactFlightRows(rows).serverReferences).toEqual([
      {
        id: 2,
        moduleId: "actions/save",
        exportName: "save",
        bound: ["workspace-1"],
      },
    ]);

    const handle = createServerActionHandler(
      {
        "actions/save#save": (...args: unknown[]) => {
          calls.push(args);
          return "saved";
        },
      },
      { csrf: false },
    );
    const actionResponse = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          bound: ["workspace-1"],
          args: ["Ada"],
        }),
      }),
    );

    expect(actionResponse.status).toBe(200);
    expect(calls).toEqual([["workspace-1", "Ada"]]);
  });

  test("serializes outlined Flight models inside bound server action arguments", async () => {
    const ClientButton = createClientReference("./Button.client.tsx", "Button");
    const save = createServerReference("actions/save", "save", [
      {
        kind: "map",
        entries: [["workspace", "workspace-1"]],
      },
    ]);
    const response = await renderToFlightResponse(createElement(ClientButton, { onSave: save }));
    const rows = toReactFlightRows(response);
    const parsed = fromReactFlightRows(rows);

    expect(rows).toContain('2:F{"id":"actions/save#save","bound":["$Q3"],"name":"save"}');
    expect(parsed.serverReferences).toEqual([
      {
        id: 2,
        moduleId: "actions/save",
        exportName: "save",
        bound: [
          {
            kind: "map",
            entries: [["workspace", "workspace-1"]],
          },
        ],
      },
    ]);
  });

  test("renders a CSP-safe Flight response script for HTML streaming integration", async () => {
    const response = await renderToFlightResponse(createElement("p", null, "Ada"));

    expect(renderFlightResponseScript(response, { id: "flight:root", nonce: "nonce-1" })).toBe(
      '<script type="application/json" data-mreact-flight id="flight:root" nonce="nonce-1">{"version":1,"root":{"kind":"element","type":"p","key":null,"props":{"children":"Ada"}},"clientReferences":[],"serverReferences":[]}</script>',
    );
    expect(renderFlightResponseScript({ ...response, root: "<tag>" })).toContain("\\u003c");
  });

  test("renders module preload links for Flight client reference chunks", async () => {
    const ClientCard = createClientReference("./Card.client.tsx", "Card", [
      "/assets/Card.client.js",
      "/assets/shared.js",
    ]);
    const ClientButton = createClientReference("./Button.client.tsx", "Button", [
      "/assets/shared.js",
      "/assets/Button.client.js",
    ]);
    const response = await renderToFlightResponse(
      createElement("main", null, [
        createElement(ClientCard, { key: "card" }),
        createElement(ClientButton, { key: "button" }),
      ]),
    );

    expect(renderFlightPreloadLinks(response, { nonce: "nonce-1" })).toBe(
      '<link rel="modulepreload" href="/assets/Card.client.js" nonce="nonce-1"><link rel="modulepreload" href="/assets/shared.js" nonce="nonce-1"><link rel="modulepreload" href="/assets/Button.client.js" nonce="nonce-1">',
    );
  });

  test("handles server action POST requests with JSON arguments", async () => {
    const handle = createServerActionHandler(
      {
        "actions/save#save": async (name: string) => ({ ok: true, name }),
      },
      { csrf: false },
    );
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

  test("rejects server action requests from disallowed origins", async () => {
    const handle = createServerActionHandler(
      {
        "actions/save#save": () => "saved",
      },
      {
        allowedOrigins: ["https://app.test"],
        csrf: false,
      },
    );
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.test",
        },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [],
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Origin not allowed.",
    });
  });

  test("requires matching CSRF header and cookie for server actions", async () => {
    const handle = createServerActionHandler(
      {
        "actions/save#save": () => "saved",
      },
      {
        csrf: true,
      },
    );

    const rejected = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "mreact.csrf=token-a",
          "x-mreact-csrf": "token-b",
        },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [],
        }),
      }),
    );
    const accepted = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "mreact.csrf=token-a",
          "x-mreact-csrf": "token-a",
        },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [],
        }),
      }),
    );

    expect(rejected.status).toBe(403);
    await expect(rejected.json()).resolves.toEqual({
      ok: false,
      error: "Invalid CSRF token.",
    });
    expect(accepted.status).toBe(200);
  });

  test("validates server action arguments before invoking an action", async () => {
    const calls: unknown[][] = [];
    const handle = createServerActionHandler(
      {
        "actions/save#save": {
          action: (...args: unknown[]) => {
            calls.push(args);
            return "saved";
          },
          validateArgs: (args) => args.length === 1 && typeof args[0] === "string",
        },
      },
      { csrf: false },
    );
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [1],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Invalid server action arguments.",
    });
    expect(calls).toEqual([]);
  });

  test("rejects malformed server action JSON payloads", async () => {
    const handle = createServerActionHandler(
      {
        "actions/save#save": () => "saved",
      },
      { csrf: false },
    );
    const response = await handle(
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Invalid JSON payload.",
    });
  });

  test("authorizes server action references before invoking an action", async () => {
    const calls: unknown[][] = [];
    const handle = createServerActionHandler(
      {
        "actions/save#save": (...args: unknown[]) => {
          calls.push(args);
          return "saved";
        },
      },
      {
        authorize: (_request, reference) =>
          reference.moduleId === "actions/save" ? "Not signed in." : true,
        csrf: false,
      },
    );
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

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Not signed in.",
    });
    expect(calls).toEqual([]);
  });

  test("rejects replayed server action nonces", async () => {
    const seen = new Set<string>();
    const handle = createServerActionHandler(
      {
        "actions/save#save": () => "saved",
      },
      {
        csrf: false,
        replayProtection: { seen },
      },
    );
    const createRequest = () =>
      new Request("https://app.test/_mreact/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-mreact-action-nonce": "nonce-1",
        },
        body: JSON.stringify({
          moduleId: "actions/save",
          exportName: "save",
          args: [],
        }),
      });

    const accepted = await handle(createRequest());
    const rejected = await handle(createRequest());

    expect(accepted.status).toBe(200);
    expect(rejected.status).toBe(409);
    await expect(rejected.json()).resolves.toEqual({
      ok: false,
      error: "Server action nonce was already used.",
    });
  });

  test("converts the modular Flight response to and from React row adapter format", async () => {
    const response = await renderToFlightResponse(createElement("p", null, "Ada"));
    const rows = toReactFlightRows(response);

    expect(rows).toBe('0:["$","p",null,{"children":"Ada"}]');
    expect(fromReactFlightRows(rows)).toEqual(response);
  });

  test("emits React Flight wire rows for client and server references", async () => {
    const ClientCard = createClientReference("./Card.client.tsx", "Card", [
      "/assets/Card.client.js",
    ]);
    const save = createServerReference("actions/save", "save");
    const response = await renderToFlightResponse(
      createElement(ClientCard, {
        name: "Ada",
        onSave: save,
        children: createElement("span", null, "Child"),
      }),
    );
    const rows = toReactFlightRows(response);

    expect(rows.split("\n")).toEqual([
      '1:I["./Card.client.tsx",["/assets/Card.client.js"],"Card"]',
      '2:F{"id":"actions/save#save","bound":null,"name":"save"}',
      '0:["$","$L1",null,{"name":"Ada","onSave":"$F2","children":["$","span",null,{"children":"Child"}]}]',
    ]);
  });

  test("parses React Flight wire rows with host elements and references", () => {
    const response = fromReactFlightRows(
      [
        '1:I["./Card.client.tsx",["/assets/Card.client.js"],"Card"]',
        '2:F{"id":"actions/save#save","bound":null,"name":"save"}',
        '0:["$","$L1","card-key",{"name":"Ada","onSave":"$F2","children":["$","span",null,{"children":"Child"}]}]',
      ].join("\n"),
    );

    expect(response).toEqual({
      version: 1,
      clientReferences: [
        {
          id: 1,
          moduleId: "./Card.client.tsx",
          exportName: "Card",
          chunks: ["/assets/Card.client.js"],
        },
      ],
      serverReferences: [
        {
          id: 2,
          moduleId: "actions/save",
          exportName: "save",
        },
      ],
      root: {
        kind: "element",
        type: {
          kind: "client-reference",
          id: 1,
        },
        key: "card-key",
        props: {
          name: "Ada",
          onSave: {
            kind: "server-reference",
            id: 2,
          },
          children: {
            kind: "element",
            type: "span",
            key: null,
            props: {
              children: "Child",
            },
          },
        },
      },
    });
  });

  test("parses React Flight hex row ids and escaped scalar tokens", () => {
    const response = fromReactFlightRows(
      [
        'a:I["./Card.client.tsx",[],"Card"]',
        'b:F{"id":"actions/save#save","bound":null,"name":"save"}',
        '0:["$","$La",null,{"onSave":"$Fb","literal":"$$value","missing":"$undefined"}]',
      ].join("\n"),
    );

    expect(response.clientReferences).toEqual([
      {
        id: 10,
        moduleId: "./Card.client.tsx",
        exportName: "Card",
        chunks: [],
      },
    ]);
    expect(response.serverReferences).toEqual([
      {
        id: 11,
        moduleId: "actions/save",
        exportName: "save",
      },
    ]);
    expect(response.root).toEqual({
      kind: "element",
      type: {
        kind: "client-reference",
        id: 10,
      },
      key: null,
      props: {
        onSave: {
          kind: "server-reference",
          id: 11,
        },
        literal: "$value",
        missing: {
          kind: "undefined",
        },
      },
    });
  });

  test("does not confuse primitive model rows with row tags", () => {
    expect(fromReactFlightRows("0:true").root).toBe(true);
    expect(fromReactFlightRows("0:false").root).toBe(false);
    expect(fromReactFlightRows("0:null").root).toBeNull();
  });

  test("parses React 19 Flight debug rows, outlined chunks, and scalar tokens", () => {
    const response = fromReactFlightRows(
      [
        ":N123.4",
        "1:T9,Hello Ada",
        '2:["$","span",null,{"children":"$1"}]',
        '3:[["answer",42]]',
        '4:["red","blue"]',
        '5:E{"digest":"digest-1","name":"Error","message":"boom","stack":[],"env":"Server"}',
        '6:HD"/style.css"',
        '0:["$","div",null,{"child":"$2","date":"$D2026-05-11T00:00:00.000Z","big":"$n123","inf":"$I","negInf":"$-Infinity","negZero":"$-0","nan":"$N","undef":"$u","map":"$Q3","set":"$W4","escaped":"$$value","error":"$5"}]',
      ].join("\n"),
    );

    expect(response.root).toEqual({
      kind: "element",
      type: "div",
      key: null,
      props: {
        child: {
          kind: "element",
          type: "span",
          key: null,
          props: {
            children: "Hello Ada",
          },
        },
        date: { kind: "date", value: "2026-05-11T00:00:00.000Z" },
        big: { kind: "bigint", value: "123" },
        inf: { kind: "number", value: "Infinity" },
        negInf: { kind: "number", value: "-Infinity" },
        negZero: { kind: "number", value: "-0" },
        nan: { kind: "number", value: "NaN" },
        undef: { kind: "undefined" },
        map: {
          kind: "map",
          entries: [["answer", 42]],
        },
        set: {
          kind: "set",
          values: ["red", "blue"],
        },
        escaped: "$value",
        error: {
          kind: "error",
          digest: "digest-1",
          name: "Error",
          message: "boom",
        },
      },
    });
  });

  test("parses React Flight FormData and iterable model tokens on the server adapter", () => {
    const response = fromReactFlightRows(
      [
        '1:[["name","Ada"],["role","admin"]]',
        '2:["red","blue"]',
        '0:["$","div",null,{"form":"$K1","items":"$i2","taint":"$Y","source":"$Efunction(){}"}]',
      ].join("\n"),
    );

    expect(response.root).toEqual({
      kind: "element",
      type: "div",
      key: null,
      props: {
        form: {
          kind: "form-data",
          entries: [
            ["name", "Ada"],
            ["role", "admin"],
          ],
        },
        items: {
          kind: "iterable",
          values: ["red", "blue"],
        },
        taint: { kind: "undefined" },
        source: { kind: "undefined" },
      },
    });
  });

  test("memoizes repeated Map and FormData outline wrappers", () => {
    const repeatedCount = 256;
    const response = fromReactFlightRows(
      [
        '1:[["key","value"]]',
        '2:[["field","value"]]',
        `0:${JSON.stringify({
          maps: Array.from({ length: repeatedCount }, () => "$Q1"),
          forms: Array.from({ length: repeatedCount }, () => "$K2"),
        })}`,
      ].join("\n"),
    );
    const root = response.root as { maps: object[]; forms: object[] };

    expect(root.maps).toHaveLength(repeatedCount);
    expect(root.forms).toHaveLength(repeatedCount);
    expect(new Set(root.maps).size).toBe(1);
    expect(new Set(root.forms).size).toBe(1);
  });

  test("keeps nested repeated Map references proportional to distinct rows", () => {
    const width = 24;
    const response = fromReactFlightRows(
      [
        `1:${JSON.stringify(
          Array.from({ length: width }, (_, index) => [`level-1-${index}`, "$Q2"]),
        )}`,
        `2:${JSON.stringify(
          Array.from({ length: width }, (_, index) => [`level-2-${index}`, "$Q3"]),
        )}`,
        '3:[["leaf","value"]]',
        '0:"$Q1"',
      ].join("\n"),
    );
    const root = response.root;
    if (typeof root !== "object" || root === null || Array.isArray(root) || root.kind !== "map") {
      throw new Error("expected root Map model");
    }
    const levelTwoModels = root.entries.map(([, value]) => value);
    const levelTwo = levelTwoModels[0];
    if (
      typeof levelTwo !== "object" ||
      levelTwo === null ||
      Array.isArray(levelTwo) ||
      levelTwo.kind !== "map"
    ) {
      throw new Error("expected nested Map model");
    }

    expect(new Set(levelTwoModels).size).toBe(1);
    expect(new Set(levelTwo.entries.map(([, value]) => value)).size).toBe(1);
  });

  test("preserves collection identity across server-reference rows and the root", () => {
    const response = fromReactFlightRows(
      [
        '2:F{"id":"actions/first#first","bound":["$Q1"],"name":"first"}',
        '3:F{"id":"actions/second#second","bound":["$Q1"],"name":"second"}',
        '1:[["key","value"]]',
        '0:{"map":"$Q1"}',
      ].join("\n"),
    );
    const root = response.root as { map: object };

    expect(response.serverReferences[0]?.bound?.[0]).toEqual({
      kind: "map",
      entries: [["key", "value"]],
    });
    expect(response.serverReferences[0]?.bound?.[0]).toBe(root.map);
    expect(response.serverReferences[1]?.bound?.[0]).toBe(root.map);
  });

  test("preserves repeated collection identity while merging later chunks", () => {
    const repeatedCount = 256;
    const initial = fromReactFlightRows(
      [
        '1:[["key","value"]]',
        `0:${JSON.stringify({
          maps: Array.from({ length: repeatedCount }, () => "$Q1"),
        })}`,
      ].join("\n"),
    );
    const merged = mergeReactFlightRows(initial, '2:"unrelated"');
    const root = merged.root as { maps: object[] };

    expect(root.maps).toHaveLength(repeatedCount);
    expect(new Set(root.maps).size).toBe(1);
  });

  test("throws on unsupported React Flight row tags on the server adapter", () => {
    expect(() => fromReactFlightRows("1:Z{}")).toThrow("Unsupported React Flight row tag: Z");
  });

  test("parses React Flight binary typed array rows on the server adapter", () => {
    const response = fromReactFlightRows(
      ["1:o4,AQIDBA==", "2:A4,AQIDBA==", '0:["$","div",null,{"bytes":"$1","buffer":"$2"}]'].join(
        "\n",
      ),
    );

    expect(response.root).toEqual({
      kind: "element",
      type: "div",
      key: null,
      props: {
        bytes: {
          kind: "typed-array",
          arrayType: "Uint8Array",
          bytes: [1, 2, 3, 4],
        },
        buffer: {
          kind: "array-buffer",
          bytes: [1, 2, 3, 4],
        },
      },
    });
  });

  test("keeps uppercase control tags distinct from lowercase high row references", () => {
    const highReference = fromReactFlightRows(['f0:"row-240"', '0:{"value":"$f0"}'].join("\n"));
    const symbol = fromReactFlightRows('0:"$Scafe"');
    const binary = fromReactFlightRows(['1:S2,AQI=', '0:"$1"'].join("\n"));

    expect(highReference.root).toEqual({ value: "row-240" });
    expect(symbol.root).toEqual({ kind: "symbol", name: "cafe" });
    expect(binary.root).toEqual({
      arrayType: "Int16Array",
      bytes: [1, 2],
      kind: "typed-array",
    });
  });

  test("emits server and client reference wire ids in hexadecimal at protocol boundaries", () => {
    const ids = Array.from({ length: 255 }, (_, index) => index + 1);
    const boundaryIds = [9, 10, 15, 16, 255];
    const serverResponse: FlightResponse = {
      version: 1,
      clientReferences: [],
      serverReferences: ids.map((id) => ({
        exportName: `action${id}`,
        id,
        moduleId: `actions/${id}`,
      })),
      root: Object.fromEntries(
        boundaryIds.map((id) => [`ref${id}`, { id, kind: "server-reference" }]),
      ),
    };
    const clientResponse: FlightResponse = {
      version: 1,
      clientReferences: ids.map((id) => ({
        chunks: [],
        exportName: "default",
        id,
        moduleId: `components/C${id}`,
      })),
      serverReferences: [],
      root: Object.fromEntries(
        boundaryIds.map((id) => [`ref${id}`, { id, kind: "client-reference" }]),
      ),
    };

    const serverRows = toReactFlightRows(serverResponse);
    const clientRows = toReactFlightRows(clientResponse);

    for (const id of boundaryIds) {
      const hex = id.toString(16);
      expect(serverRows).toContain(`"ref${id}":"$F${hex}"`);
      expect(clientRows).toContain(`"ref${id}":"$L${hex}"`);
    }
    expect(fromReactFlightRows(serverRows).root).toEqual(serverResponse.root);
    expect(fromReactFlightRows(clientRows).root).toEqual(clientResponse.root);
  });

  test("merges incremental React Flight rows into an existing response", () => {
    const initial = fromReactFlightRows('0:["$","p",null,{"children":"$@1"}]');
    const merged = mergeReactFlightRows(initial, "1:T9,Hello Ada");

    expect(merged.root).toEqual({
      kind: "element",
      type: "p",
      key: null,
      props: {
        children: "Hello Ada",
      },
    });
  });

  test("emits React Flight scalar tokens and outlined map/set rows", async () => {
    const response = await renderToFlightResponse({
      when: new Date("2026-05-11T00:00:00.000Z"),
      total: 123n,
      inf: Infinity,
      negZero: -0,
      nan: Number.NaN,
      map: new Map<unknown, unknown>([["answer", 42]]),
      set: new Set<unknown>(["red", "blue"]),
    });
    const rows = toReactFlightRows(response);

    expect(rows).toContain('"when":"$D2026-05-11T00:00:00.000Z"');
    expect(rows).toContain('"total":"$n123"');
    expect(rows).toContain('"inf":"$I"');
    expect(rows).toContain('"negZero":"$-0"');
    expect(rows).toContain('"nan":"$N"');
    expect(rows).toMatch(/(^|\n)[0-9a-f]+:\[\["answer",42\]\]/);
    expect(rows).toMatch(/(^|\n)[0-9a-f]+:\["red","blue"\]/);
    expect(fromReactFlightRows(rows).root).toEqual(response.root);
  });

  test("emits React Flight FormData and iterable outline rows", async () => {
    const formData = new FormData();
    formData.append("name", "Ada");
    formData.append("count", "2");
    const iterable = new Set<unknown>(["first", 2]).values();
    const response = await renderToFlightResponse({
      formData,
      iterable,
    });
    const rows = toReactFlightRows(response);

    expect(rows).toMatch(/"formData":"\$K[0-9a-f]+"/);
    expect(rows).toMatch(/"iterable":"\$i[0-9a-f]+"/);
    expect(fromReactFlightRows(rows).root).toEqual(response.root);
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

function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}
