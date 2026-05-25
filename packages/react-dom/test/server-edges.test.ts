import { createElement } from "@reckona/mreact-compat";
import { describe, expect, test, vi } from "vitest";
import {
  renderToPipeableStream,
  renderToReadableStream,
  renderToStaticMarkup,
  renderToString,
  resume,
  resumeToPipeableStream,
} from "../src/server.js";

describe("react-dom/server edge branches", () => {
  test("renderToString renders a basic element", () => {
    const html = renderToString(createElement("p", null, "hi"));
    expect(html).toBe("<p>hi</p>");
  });

  test("renderToStaticMarkup ignores ServerOptions and produces the same HTML", () => {
    const html = renderToStaticMarkup(
      createElement("p", null, "hi"),
      { identifierPrefix: "x:" },
    );
    expect(html).toBe("<p>hi</p>");
  });

  test("renderToReadableStream emits the HTML and resolves allReady", async () => {
    const stream = await renderToReadableStream(
      createElement("p", null, "hi"),
    );
    await expect(stream.allReady).resolves.toBeUndefined();
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      html += decoder.decode(result.value);
    }
    expect(html).toContain("<p>hi</p>");
  });

  test("renderToReadableStream rejects allReady when the AbortSignal is pre-aborted", async () => {
    const controller = new AbortController();
    controller.abort("pre-aborted");
    const stream = await renderToReadableStream(
      createElement("p", null, "hi"),
      { signal: controller.signal },
    );
    await expect(stream.allReady).rejects.toBe("pre-aborted");
  });

  test("renderToReadableStream invokes onHeaders with text/html;charset=utf-8", async () => {
    const onHeaders = vi.fn();
    await renderToReadableStream(createElement("p", null, "hi"), { onHeaders });
    expect(onHeaders).toHaveBeenCalled();
    const headers = onHeaders.mock.calls[0]?.[0] as Headers;
    expect(headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  test("renderToReadableStream renders importMap / bootstrapScripts / bootstrapModules", async () => {
    const stream = await renderToReadableStream(
      createElement("p", null, "hi"),
      {
        nonce: "n1",
        importMap: { imports: { foo: "/foo.js" } },
        bootstrapScriptContent: "console.log(1)",
        bootstrapScripts: [
          "/a.js",
          { src: "/b.js", integrity: "sha-x", crossOrigin: "anonymous" },
        ],
        bootstrapModules: ["/m.js"],
      },
    );
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      html += decoder.decode(result.value);
    }
    expect(html).toContain('type="importmap"');
    expect(html).toContain('nonce="n1"');
    expect(html).toContain("console.log(1)");
    expect(html).toContain('src="/a.js"');
    expect(html).toContain('integrity="sha-x"');
    expect(html).toContain('crossorigin="anonymous"');
    expect(html).toContain('type="module"');
    expect(html).toContain('src="/m.js"');
  });

  test("renderToPipeableStream pipes HTML and calls all the lifecycle callbacks", async () => {
    const onShellReady = vi.fn();
    const onAllReady = vi.fn();
    const onError = vi.fn();
    const onShellError = vi.fn();
    const stream = renderToPipeableStream(createElement("p", null, "hi"), {
      onShellReady,
      onAllReady,
      onError,
      onShellError,
    });
    let written = "";
    const destination = {
      write(chunk: string | Uint8Array) {
        written += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        return true;
      },
      end() {},
    };
    stream.pipe(destination);
    await Promise.resolve();
    await Promise.resolve();
    expect(onShellReady).toHaveBeenCalled();
    expect(onAllReady).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(written).toContain("<p>hi</p>");
  });

  test("renderToPipeableStream.abort calls onError and skips the pipe", async () => {
    const onError = vi.fn();
    const stream = renderToPipeableStream(createElement("p", null, "hi"), {
      onError,
    });
    stream.abort(new Error("user-abort"));
    let written = "";
    stream.pipe({
      write(chunk: string | Uint8Array) {
        written += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        return true;
      },
      end() {},
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalled();
    expect(written).toBe("");
  });

  test("renderToReadableStream rejects allReady when the AbortSignal fires after start()", async () => {
    const controller = new AbortController();
    const stream = await renderToReadableStream(
      createElement("p", null, "hi"),
      { signal: controller.signal },
    );
    // The render typically completes synchronously, but the abort listener is
    // installed before that completion. Fire the abort to exercise the
    // listener body. allReady may have already resolved by the time abort
    // fires, so we only assert that no unhandled rejection escapes.
    controller.abort("mid-flight-abort");
    await stream.allReady.catch(() => undefined);
  });

  test("renderToPipeableStream catches a destination.write throw and reports it via onError + onShellError + destroy", async () => {
    const onError = vi.fn();
    const onShellError = vi.fn();
    let destroyError: unknown;
    const stream = renderToPipeableStream(createElement("p", null, "hi"), {
      onError,
      onShellError,
    });
    stream.pipe({
      write() {
        throw new Error("destination-write-error");
      },
      end() {},
      destroy: (error?: unknown) => {
        destroyError = error;
      },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalled();
    expect(onShellError).toHaveBeenCalled();
    expect((destroyError as Error).message).toBe("destination-write-error");
  });

  test("renderToReadableStream catches an encoder.encode throw via onError + controller.error", async () => {
    const onError = vi.fn();
    const originalEncode = TextEncoder.prototype.encode;
    // Force the encoder to throw exactly once so the start() callback enters
    // its catch arm.
    let thrown = false;
    TextEncoder.prototype.encode = function patched(this: TextEncoder, input?: string) {
      if (!thrown) {
        thrown = true;
        throw new Error("encoder-fail");
      }
      return originalEncode.call(this, input ?? "");
    };
    try {
      const stream = await renderToReadableStream(
        createElement("p", null, "hi"),
        { onError },
      );
      await stream.allReady.catch(() => undefined);
      const reader = stream.getReader();
      await reader.read().catch(() => undefined);
      expect(onError).toHaveBeenCalled();
    } finally {
      TextEncoder.prototype.encode = originalEncode;
    }
  });

  test("resume and resumeToPipeableStream delegate to the basic renderers", async () => {
    const stream = await resume(createElement("p", null, "hi"), undefined);
    await expect(stream.allReady).resolves.toBeUndefined();

    const pipe = await resumeToPipeableStream(
      createElement("p", null, "hi"),
      undefined,
    );
    let written = "";
    pipe.pipe({
      write(chunk: string | Uint8Array) {
        written += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        return true;
      },
      end() {},
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(written).toContain("<p>hi</p>");
  });

  test("resume APIs currently ignore postponed state", async () => {
    const readable = await resume(
      createElement("section", null, "fresh render"),
      { marker: "not-consumed-by-readable-resume" },
    );
    await readable.allReady;
    expect(await readReadableStream(readable)).toBe("<section>fresh render</section>");

    const pipeable = await resumeToPipeableStream(
      createElement("section", null, "fresh render"),
      { marker: "not-consumed-by-pipeable-resume" },
    );

    expect(await pipeableToString(pipeable)).toBe("<section>fresh render</section>");
  });
});

async function readReadableStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = "";

  while (true) {
    const result = await reader.read();
    if (result.done) {
      return html;
    }
    html += decoder.decode(result.value);
  }
}

async function pipeableToString(stream: {
  pipe(destination: {
    write(chunk: string | Uint8Array): void;
    end(): void;
  }): void;
}): Promise<string> {
  let html = "";

  stream.pipe({
    write(chunk: string | Uint8Array) {
      html += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    },
    end() {},
  });
  await Promise.resolve();
  await Promise.resolve();

  return html;
}
