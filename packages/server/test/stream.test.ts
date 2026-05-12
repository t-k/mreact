import { describe, expect, test } from "vitest";
import {
  createStringSink,
  renderAsyncBoundary,
  renderOutOfOrderBoundary,
  renderOutOfOrderReorderScript,
  renderReactSuspenseBoundary,
  renderReactSuspenseClientRenderBoundary,
  renderReactSuspenseOutOfOrderBoundary,
  renderScriptAsset,
  renderToReadableStream,
  renderToString,
  reactSuspenseRevealExternalScript,
} from "../src/index.js";

describe("server streaming runtime", () => {
  test("string sink preserves appended chunk order", () => {
    const sink = createStringSink();

    sink.append("<p>");
    sink.append("Hello");
    sink.append("</p>");

    expect(sink.toString()).toBe("<p>Hello</p>");
  });

  test("string sink preserves output for every buffer strategy", () => {
    const expected = '<div title="Cell &lt;important&gt;">ok</div>';

    for (const strategy of ["concat", "array-join", "auto"] as const) {
      const sink = createStringSink({ strategy, arrayJoinThreshold: 2 });

      sink.append("<div title=\"");
      sink.append("Cell &lt;important&gt;");
      sink.append("\">ok</div>");

      expect(sink.toString()).toBe(expected);
      expect(sink.bufferStrategy()).toBe(strategy === "auto" ? "array-join" : strategy);
    }
  });

  test("renderToString waits for async render before returning HTML", async () => {
    const html = await renderToString(async (sink) => {
      sink.append("<p>");
      await Promise.resolve();
      sink.append("Async");
      sink.append("</p>");
    });

    expect(html).toBe("<p>Async</p>");
  });

  test("renderToReadableStream emits appended chunks in order", async () => {
    const stream = renderToReadableStream((sink) => {
      sink.append("<p>");
      sink.append("Stream");
      sink.append("</p>");
    });

    await expect(readStream(stream)).resolves.toBe("<p>Stream</p>");
  });

  test("async boundary renders resolved content after awaiting value", async () => {
    const sink = createStringSink();

    sink.append("<section>");
    await renderAsyncBoundary(sink, Promise.resolve("Ada"), (boundarySink, name) => {
      boundarySink.append(`<span>${name}</span>`);
    });
    sink.append("</section>");

    expect(sink.toString()).toBe("<section><span>Ada</span></section>");
  });

  test("async boundary emits hydration data when hydrationAwaitId is set", async () => {
    const sink = createStringSink();

    await renderAsyncBoundary(
      sink,
      Promise.resolve({ name: "Ada", id: 1 }),
      (boundarySink, value) => {
        boundarySink.append(`<span>${value.name}</span>`);
      },
      { hydrationAwaitId: "await0" },
    );

    const html = sink.toString();
    expect(html).toContain("<span>Ada</span>");
    expect(html).toContain('data-mreact-await="await0"');
    expect(html).toContain('__mreactAwaitData');
    expect(html).toContain('"await0"');
    expect(html).toContain('{"name":"Ada","id":1}');
  });

  test("async boundary hydration data escapes </script> sequences", async () => {
    const sink = createStringSink();

    await renderAsyncBoundary(
      sink,
      Promise.resolve("</script><script>alert(1)</script>"),
      () => {},
      { hydrationAwaitId: "await0" },
    );

    const html = sink.toString();
    expect(html).not.toContain("</script><script>");
    expect(html).toContain("\\u003c/script");
  });

  test("out-of-order boundary emits hydration data outside the OOB template", async () => {
    const html = await renderToString((sink) => {
      renderOutOfOrderBoundary(
        sink,
        "frag-1",
        Promise.resolve([1, 2, 3]),
        (boundarySink, values) => {
          boundarySink.append(`<ul>${values.map((v) => `<li>${v}</li>`).join("")}</ul>`);
        },
        {
          placeholder(boundarySink) {
            boundarySink.append("<p>loading...</p>");
          },
          hydrationAwaitId: "await1",
        },
      );
    });

    expect(html).toContain('data-mreact-oob-fragment="frag-1"');
    // The data script must live *outside* the OOB fragment <template> so
    // browsers actually execute it. We check that the script appears after
    // the closing </template> tag.
    const fragmentClose = html.indexOf("</template>", html.indexOf("oob-fragment"));
    const scriptIndex = html.indexOf('data-mreact-await="await1"');
    expect(scriptIndex).toBeGreaterThan(fragmentClose);
  });

  test("async boundary renders catch content for rejected values", async () => {
    const sink = createStringSink();

    await renderAsyncBoundary(
      sink,
      Promise.reject(new Error("load failed")),
      (boundarySink, name) => {
        boundarySink.append(`<span>${name}</span>`);
      },
      {
        catch(boundarySink, error) {
          boundarySink.append(`<strong>${(error as Error).message}</strong>`);
        },
      },
    );

    expect(sink.toString()).toBe("<strong>load failed</strong>");
  });

  test("out-of-order boundary appends placeholder before later sync html and fragment after resolution", async () => {
    const html = await renderToString((sink) => {
      sink.append("<section>");
      renderOutOfOrderBoundary(
        sink,
        "mreact-0",
        Promise.resolve("Ada"),
        (boundarySink, name) => {
          boundarySink.append(`<span>${name}</span>`);
        },
        {
          placeholder(boundarySink) {
            boundarySink.append("<span>Loading</span>");
          },
        },
      );
      sink.append("<p>After</p>");
      sink.append("</section>");
    });

    expect(html).toBe(
      '<section><template data-mreact-oob-placeholder="mreact-0"><span>Loading</span></template><p>After</p></section><template data-mreact-oob-fragment="mreact-0"><span>Ada</span></template>',
    );
  });

  test("out-of-order boundary appends catch fragment for rejected values", async () => {
    const html = await renderToString((sink) => {
      renderOutOfOrderBoundary(
        sink,
        "mreact-1",
        Promise.reject(new Error("load failed")),
        (boundarySink, name) => {
          boundarySink.append(`<span>${name}</span>`);
        },
        {
          placeholder(boundarySink) {
            boundarySink.append("<span>Loading</span>");
          },
          catch(boundarySink, error) {
            boundarySink.append(`<strong>${(error as Error).message}</strong>`);
          },
        },
      );
    });

    expect(html).toBe(
      '<template data-mreact-oob-placeholder="mreact-1"><span>Loading</span></template><template data-mreact-oob-fragment="mreact-1"><strong>load failed</strong></template>',
    );
  });

  test("out-of-order reorder bootstrap appends a marker script", () => {
    const sink = createStringSink();

    renderOutOfOrderReorderScript(sink);

    expect(sink.toString()).toContain("<script data-mreact-oob-reorder>");
    expect(sink.toString()).toContain("</script>");
  });

  test("out-of-order reorder bootstrap observes future fragments", () => {
    const sink = createStringSink();

    renderOutOfOrderReorderScript(sink);

    expect(sink.toString()).toContain("data-mreact-oob-fragment");
    expect(sink.toString()).toContain("data-mreact-oob-placeholder");
    expect(sink.toString()).toContain("MutationObserver");
  });

  test("out-of-order reorder bootstrap accepts a CSP nonce", () => {
    const sink = createStringSink();

    renderOutOfOrderReorderScript(sink, { nonce: 'nonce-&"<value>' });

    expect(sink.toString()).toContain(
      '<script data-mreact-oob-reorder nonce="nonce-&amp;&quot;&lt;value&gt;">',
    );
  });

  test("out-of-order reorder bootstrap can reference an external script", () => {
    const sink = createStringSink();

    renderOutOfOrderReorderScript(sink, { src: "/assets/mreact-oob.js" });

    expect(sink.toString()).toBe(
      '<script data-mreact-oob-reorder src="/assets/mreact-oob.js"></script>',
    );
  });

  test("out-of-order external bootstrap can include a CSP nonce", () => {
    const sink = createStringSink();

    renderOutOfOrderReorderScript(sink, {
      nonce: "nonce-1",
      src: "/assets/mreact-oob.js",
    });

    expect(sink.toString()).toBe(
      '<script data-mreact-oob-reorder nonce="nonce-1" src="/assets/mreact-oob.js"></script>',
    );
  });

  test("React Suspense completed boundary emits React comment markers", async () => {
    const html = await renderToString((sink) => {
      sink.append("<section>");
      renderReactSuspenseBoundary(sink, (boundarySink) => {
        boundarySink.append("<span>Ada</span>");
      });
      sink.append("</section>");
    });

    expect(html).toBe("<section><!--$--><span>Ada</span><!--/$--></section>");
  });

  test("React Suspense out-of-order boundary emits pending marker and reveal script", async () => {
    const html = await renderToString((sink) => {
      sink.append("<section>");
      renderReactSuspenseOutOfOrderBoundary(
        sink,
        "B:0",
        "S:0",
        Promise.resolve("Ada"),
        (boundarySink, name) => {
          boundarySink.append(`<span>${name}</span>`);
        },
        {
          fallback(boundarySink) {
            boundarySink.append("<em>loading</em>");
          },
          nonce: "nonce-1",
        },
      );
      sink.append("</section>");
    });

    expect(html).toContain(
      '<section><!--$?--><template id="B:0"></template><em>loading</em><!--/$--></section>',
    );
    expect(html).toContain('<div hidden id="S:0"><span>Ada</span></div>');
    expect(html).toContain('<script nonce="nonce-1">');
    expect(html).toContain('$RC("B:0","S:0")');
  });

  test("React Suspense out-of-order boundary can reference an external reveal script", async () => {
    const html = await renderToString((sink) => {
      renderReactSuspenseOutOfOrderBoundary(
        sink,
        "B:0",
        "S:0",
        Promise.resolve("Ada"),
        (boundarySink, name) => {
          boundarySink.append(`<span>${name}</span>`);
        },
        {
          fallback(boundarySink) {
            boundarySink.append("<em>loading</em>");
          },
          nonce: "nonce-1",
          src: "/assets/mreact-react-suspense-reveal.js",
        },
      );
    });

    expect(html).toContain(
      '<script data-mreact-react-suspense-reveal nonce="nonce-1" src="/assets/mreact-react-suspense-reveal.js" data-boundary-id="B:0" data-segment-id="S:0"></script>',
    );
    expect(html).not.toContain("$RC(");
  });

  test("React Suspense external reveal asset reads current script metadata", () => {
    expect(reactSuspenseRevealExternalScript).toContain("document.currentScript");
    expect(reactSuspenseRevealExternalScript).toContain("data-boundary-id");
    expect(reactSuspenseRevealExternalScript).toContain("data-segment-id");
    expect(reactSuspenseRevealExternalScript).not.toContain("<");
  });

  test("React Suspense client render boundary emits error marker with escaped template metadata", () => {
    const sink = createStringSink();

    renderReactSuspenseClientRenderBoundary(
      sink,
      (boundarySink) => {
        boundarySink.append("<em>loading</em>");
      },
      { message: 'bad "&<value>' },
    );

    expect(sink.toString()).toBe(
      '<!--$!--><template data-msg="bad &quot;&amp;&lt;value&gt;"></template><em>loading</em><!--/$-->',
    );
  });

  test("script asset helper emits CSP nonce and SRI integrity", () => {
    const sink = createStringSink();

    renderScriptAsset(sink, {
      src: "/assets/client.js",
      nonce: "nonce-1",
      integrity: "sha384-abc",
    });

    expect(sink.toString()).toBe(
      '<script src="/assets/client.js" nonce="nonce-1" integrity="sha384-abc" crossorigin="anonymous"></script>',
    );
  });

  test("warns when <await> value is non-JSON-serializable in dev", async () => {
    const originalEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "development";
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));

    try {
      const sink = createStringSink();
      await renderAsyncBoundary(
        sink,
        Promise.resolve(new Date("2026-01-01T00:00:00Z")),
        () => {},
        { hydrationAwaitId: "await-date" },
      );
    } finally {
      console.warn = originalWarn;
      if (originalEnv === undefined) {
        delete process.env["NODE_ENV"];
      } else {
        process.env["NODE_ENV"] = originalEnv;
      }
    }

    expect(warnings.some((message) => /non-serializable|round-trip/i.test(message))).toBe(true);
  });

  test("does not warn for plain serializable values", async () => {
    const originalEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "development";
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));

    try {
      const sink = createStringSink();
      await renderAsyncBoundary(
        sink,
        Promise.resolve({ name: "Ada", id: 1, tags: ["a", "b"] }),
        () => {},
        { hydrationAwaitId: "await-plain" },
      );
    } finally {
      console.warn = originalWarn;
      if (originalEnv === undefined) {
        delete process.env["NODE_ENV"];
      } else {
        process.env["NODE_ENV"] = originalEnv;
      }
    }

    expect(warnings).toEqual([]);
  });

  test("warns when serialized <await> payload exceeds 100KB", async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));

    try {
      const sink = createStringSink();
      // ~150KB payload: 1500 items of ~100 bytes each
      const huge = Array.from({ length: 1500 }, (_, i) => ({
        id: i,
        text: "x".repeat(80),
      }));

      await renderAsyncBoundary(
        sink,
        Promise.resolve(huge),
        () => {},
        { hydrationAwaitId: "await-large" },
      );
    } finally {
      console.warn = originalWarn;
    }

    expect(warnings.some((message) => /large await payload|100\s*KB/i.test(message))).toBe(true);
  });

  test("errors when serialized <await> payload exceeds 1MB", async () => {
    const errors: string[] = [];
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
    console.warn = () => {};

    try {
      const sink = createStringSink();
      // ~1.2MB payload
      const huge = Array.from({ length: 15000 }, (_, i) => ({
        id: i,
        text: "x".repeat(80),
      }));

      await renderAsyncBoundary(
        sink,
        Promise.resolve(huge),
        () => {},
        { hydrationAwaitId: "await-huge" },
      );
    } finally {
      console.error = originalError;
      console.warn = originalWarn;
    }

    expect(errors.some((message) => /1\s*MB/i.test(message))).toBe(true);
  });
});

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = "";

  for (;;) {
    const result = await reader.read();

    if (result.done) {
      html += decoder.decode();
      return html;
    }

    html += decoder.decode(result.value, { stream: true });
  }
}
