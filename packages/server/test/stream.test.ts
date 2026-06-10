import { describe, expect, test, vi } from "vitest";
import {
  createStringSink,
  html as renderHtmlResponse,
  renderAsyncBoundary,
  renderOutOfOrderBoundary,
  renderOutOfOrderReorderScript,
  renderReactSuspenseBoundary,
  renderReactSuspenseClientRenderBoundary,
  renderReactSuspenseOutOfOrderBoundary,
  renderScriptAsset,
  renderToReadableStream,
  renderToString,
  Suspense,
  reactSuspenseRevealExternalScript,
} from "../src/index.js";
import { createElement } from "@reckona/mreact-compat";

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

  test("renderToReadableStream exposes an abort signal and aborts it on cancel", async () => {
    let signal: AbortSignal | undefined;
    let aborted = false;
    const stream = renderToReadableStream((sink) => {
      signal = sink.signal;
      signal?.addEventListener("abort", () => {
        aborted = true;
      });
      sink.append("SHELL");
      sink.defer!(new Promise(() => undefined));
    });
    const reader = stream.getReader();

    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(new TextDecoder().decode(first.value)).toBe("SHELL");
    await reader.cancel("client disconnected");

    expect(signal?.aborted).toBe(true);
    expect(aborted).toBe(true);
  });

  test("renderToReadableStream can warn about deferred errors ignored after abort in dev", async () => {
    const originalEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "development";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let rejectDeferred: ((error: unknown) => void) | undefined;
    const stream = renderToReadableStream(
      (sink) => {
        sink.append("SHELL");
        sink.defer!(
          new Promise<void>((_, reject) => {
            rejectDeferred = reject;
          }),
        );
      },
      { logAbortedDeferredErrors: true },
    );
    const reader = stream.getReader();

    await reader.read();
    await reader.cancel("client disconnected");
    rejectDeferred?.(new Error("late deferred boom"));
    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("ignored deferred task error after abort"),
      expect.any(Error),
    );
    warn.mockRestore();
    if (originalEnv === undefined) {
      delete process.env["NODE_ENV"];
    } else {
      process.env["NODE_ENV"] = originalEnv;
    }
  });

  test("renderToReadableStream does not log ignored deferred abort errors by default", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let rejectDeferred: ((error: unknown) => void) | undefined;
    const stream = renderToReadableStream((sink) => {
      sink.append("SHELL");
      sink.defer!(
        new Promise<void>((_, reject) => {
          rejectDeferred = reject;
        }),
      );
    });
    const reader = stream.getReader();

    await reader.read();
    await reader.cancel("client disconnected");
    rejectDeferred?.(new Error("late deferred boom"));
    await Promise.resolve();

    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("ignored deferred task error after abort"),
      expect.any(Error),
    );
    warn.mockRestore();
  });

  test("renderToReadableStream warns when queued chunks exceed the soft limit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stream = renderToReadableStream((sink) => {
      sink.append("a");
      sink.defer?.(
        Promise.resolve().then(() => {
          sink.append("b".repeat(1024 * 1024 + 1));
        }),
      );
    });
    const reader = stream.getReader();

    await Promise.resolve();
    await Promise.resolve();
    await reader.cancel("done");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("queued"));
    warn.mockRestore();
  });

  test("renderToReadableStream exposes a backpressure promise for deferred work", async () => {
    const events: string[] = [];
    const stream = renderToReadableStream((sink) => {
      sink.append("SHELL");
      sink.defer!(
        Promise.resolve().then(async () => {
          events.push("deferred-ready");
          await sink.backpressure?.();
          events.push("deferred-resumed");
          sink.append("BODY");
        }),
      );
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(["deferred-ready"]);

    const reader = stream.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(new TextDecoder().decode(first.value)).toBe("SHELL");

    const second = await reader.read();
    expect(second.done).toBe(false);
    expect(new TextDecoder().decode(second.value)).toBe("BODY");
    expect(events).toEqual(["deferred-ready", "deferred-resumed"]);
  });

  test("renderAsyncBoundary waits for downstream backpressure before rendering resolved content", async () => {
    let rendered = false;
    const stream = renderToReadableStream((sink) => {
      sink.append("SHELL");
      sink.defer!(
        renderAsyncBoundary(sink, Promise.resolve("BODY"), (boundarySink, value) => {
          rendered = true;
          boundarySink.append(value);
        }),
      );
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(rendered).toBe(false);

    const reader = stream.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(new TextDecoder().decode(first.value)).toBe("SHELL");

    const second = await reader.read();
    expect(second.done).toBe(false);
    expect(new TextDecoder().decode(second.value)).toBe("BODY");
    expect(rendered).toBe(true);
  });

  test("renderOutOfOrderBoundary propagates downstream backpressure into fragment rendering", async () => {
    let rendered = false;
    const stream = renderToReadableStream((sink) => {
      sink.append("SHELL");
      renderOutOfOrderBoundary(
        sink,
        "frag",
        Promise.resolve("BODY"),
        (boundarySink, value) => {
          rendered = true;
          boundarySink.append(value);
        },
        {
          placeholder(placeholderSink) {
            placeholderSink.append("WAIT");
          },
        },
      );
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(rendered).toBe(false);

    const reader = stream.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(new TextDecoder().decode(first.value)).toContain("SHELL");
    expect(new TextDecoder().decode(first.value)).toContain("WAIT");

    const second = await reader.read();
    expect(second.done).toBe(false);
    expect(new TextDecoder().decode(second.value)).toContain("BODY");
    expect(rendered).toBe(true);
  });

  test("renderOutOfOrderBoundary rejects async placeholder callbacks in development", async () => {
    const stream = renderToReadableStream((sink) => {
        renderOutOfOrderBoundary(
          sink,
          "frag",
          Promise.resolve("BODY"),
          (boundarySink, value) => {
            boundarySink.append(value);
          },
          {
            placeholder: (async (placeholderSink) => {
              await Promise.resolve();
              placeholderSink.append("WAIT");
            }) as never,
          },
        );
      });

    await expect(stream.getReader().read()).rejects.toThrow(
      "renderOutOfOrderBoundary placeholder must be synchronous",
    );
  });

  test("renderToReadableStream does not require process when queued chunks exceed the soft limit", async () => {
    const globalWithProcess = globalThis as typeof globalThis & { process?: unknown };
    const previousProcess = globalWithProcess.process;
    const body = "x".repeat(1024 * 1024 + 1);

    try {
      globalWithProcess.process = undefined;
      const stream = renderToReadableStream((sink) => {
        sink.append(body);
        sink.append(body);
        sink.append("tail");
      });

      await expect(readStream(stream)).resolves.toBe(`${body}${body}tail`);
    } finally {
      globalWithProcess.process = previousProcess;
    }
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

  test("async boundary hydration data attribute escapes quoted await ids", async () => {
    const sink = createStringSink();

    await renderAsyncBoundary(
      sink,
      Promise.resolve("ok"),
      () => {},
      { hydrationAwaitId: `await"bad>` },
    );

    const html = sink.toString();
    expect(html).toContain('data-mreact-await="await&quot;bad&gt;"');
    expect(html).toContain('["await\\"bad>"]');
  });

  test("nested react suspense boundaries keep inner out-of-order reveal content", async () => {
    const response = renderHtmlResponse(
      createElement(
        Suspense,
        { fallback: createElement("em", null, "outer loading") },
        createElement(
          "section",
          null,
          createElement(
            Suspense,
            { fallback: createElement("em", null, "inner loading") },
            Promise.resolve(createElement("strong", null, "inner")),
          ),
        ),
      ),
    );

    const html = await response.text();
    expect(html).toContain("<em>inner loading</em>");
    expect(html).toContain("<strong>inner</strong>");
    expect(html).toContain("$RC");
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
      '<section><span data-mreact-oob-placeholder="mreact-0"><span>Loading</span></span><p>After</p></section><template data-mreact-oob-fragment="mreact-0"><span>Ada</span></template>',
    );
  });

  test("out-of-order boundary can use a block placeholder host", async () => {
    const html = await renderToString((sink) => {
      renderOutOfOrderBoundary(
        sink,
        "mreact-0",
        Promise.resolve("Ada"),
        (boundarySink, name) => {
          boundarySink.append(`<span>${name}</span>`);
        },
        {
          placeholder(boundarySink) {
            boundarySink.append("<ol><li>Loading</li></ol>");
          },
          placeholderTag: "div",
        },
      );
    });

    expect(html).toBe(
      '<div data-mreact-oob-placeholder="mreact-0"><ol><li>Loading</li></ol></div><template data-mreact-oob-fragment="mreact-0"><span>Ada</span></template>',
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
      '<span data-mreact-oob-placeholder="mreact-1"><span>Loading</span></span><template data-mreact-oob-fragment="mreact-1"><strong>load failed</strong></template>',
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

  test("React Suspense out-of-order boundaries uniquify repeated ids per sink", async () => {
    const html = await renderToString((sink) => {
      renderReactSuspenseOutOfOrderBoundary(
        sink,
        "B:0",
        "S:0",
        Promise.resolve("Ada"),
        (boundarySink, name) => {
          boundarySink.append(`<span>${name}</span>`);
        },
      );
      renderReactSuspenseOutOfOrderBoundary(
        sink,
        "B:0",
        "S:0",
        Promise.resolve("Grace"),
        (boundarySink, name) => {
          boundarySink.append(`<span>${name}</span>`);
        },
      );
    });

    expect(html).toContain('<template id="B:0"></template>');
    expect(html).toContain('<template id="B:0-1"></template>');
    expect(html).toContain('<div hidden id="S:0"><span>Ada</span></div>');
    expect(html).toContain('<div hidden id="S:0-1"><span>Grace</span></div>');
    expect(html).toContain('$RC("B:0","S:0")');
    expect(html).toContain('$RC("B:0-1","S:0-1")');
  });

  test("React Suspense reveal script escapes script-breaking JSON characters", async () => {
    const html = await renderToString((sink) => {
      renderReactSuspenseOutOfOrderBoundary(
        sink,
        "B:\u2028</script>",
        "S:\u2029<script>",
        Promise.resolve("Ada"),
        (boundarySink, name) => {
          boundarySink.append(`<span>${name}</span>`);
        },
      );
    });

    expect(html).not.toContain("</script>\"");
    expect(html).toContain('$RC("B:\\u2028\\u003c/script>","S:\\u2029\\u003cscript>")');
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

  test("warns when <Await> value is non-JSON-serializable in dev", async () => {
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
    expect(warnings.join("\n")).not.toContain("docs/");
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

  test("warns when serialized <Await> payload exceeds 100KB", async () => {
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

  test("errors when serialized <Await> payload exceeds 1MB", async () => {
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
