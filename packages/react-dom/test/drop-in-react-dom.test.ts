// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { createElement } from "../../react/src/index.js";
import { createRoot, hydrateRoot } from "../src/client.js";
import {
  flushSync,
  preconnect,
  prefetchDNS,
  preinit,
  preinitModule,
  preload,
  preloadModule,
  render,
  requestFormReset,
  unstable_batchedUpdates,
  unmountComponentAtNode,
  useFormState,
  useFormStatus,
} from "../src/index.js";
import {
  renderToPipeableStream,
  renderToReadableStream,
  renderToStaticMarkup,
  renderToString,
  resume,
  resumeToPipeableStream,
} from "../src/server.js";

describe("react-dom drop-in entrypoints", () => {
  test("client and legacy DOM entrypoints render and hydrate", async () => {
    const clientContainer = document.createElement("div");
    const root = createRoot(clientContainer);

    root.render(createElement("button", null, "Save"));
    expect(clientContainer.innerHTML).toBe("<button>Save</button>");

    flushSync(() => {
      root.render(createElement("button", null, "Saved"));
    });
    expect(clientContainer.innerHTML).toBe("<button>Saved</button>");

    const legacyContainer = document.createElement("div");
    render(createElement("p", null, "Legacy"), legacyContainer);
    expect(legacyContainer.innerHTML).toBe("<p>Legacy</p>");
    expect(unmountComponentAtNode(legacyContainer)).toBe(true);
    expect(legacyContainer.innerHTML).toBe("");

    const hydrationContainer = document.createElement("div");
    hydrationContainer.innerHTML = "<span>Ada</span>";
    const serverSpan = hydrationContainer.querySelector("span");
    hydrateRoot(hydrationContainer, createElement("span", null, "Ada"));
    expect(hydrationContainer.querySelector("span")).toBe(serverSpan);
  });

  test("client resource hint APIs materialize deduplicated head resources", () => {
    document.head.replaceChildren();
    const settings = getHappyDomSettings();
    const previousSettings = {
      disableCSSFileLoading: settings?.disableCSSFileLoading,
      disableJavaScriptFileLoading: settings?.disableJavaScriptFileLoading,
      handleDisabledFileLoadingAsSuccess: settings?.handleDisabledFileLoadingAsSuccess,
    };

    if (settings !== undefined) {
      settings.disableCSSFileLoading = true;
      settings.disableJavaScriptFileLoading = true;
      settings.handleDisabledFileLoadingAsSuccess = true;
    }

    try {
      preconnect("https://cdn.example.test", { crossOrigin: "anonymous" });
      preconnect("https://cdn.example.test", { crossOrigin: "anonymous" });
      prefetchDNS("https://dns.example.test");
      preload("/app.css", {
        as: "style",
        fetchPriority: "high",
        integrity: "sha256-css",
        nonce: "nonce-1",
      });
      preload("/hero.png", {
        as: "image",
        imageSrcSet: "/hero@1x.png 1x, /hero@2x.png 2x",
        imageSizes: "100vw",
      });
      preloadModule("/entry.js", {
        as: "script",
        crossOrigin: "use-credentials",
        integrity: "sha256-module",
        nonce: "nonce-2",
      });
      preinit("/critical.css", {
        as: "style",
        precedence: "high",
        nonce: "nonce-3",
      });
      preinit("/boot.js", {
        as: "script",
        crossOrigin: "anonymous",
        fetchPriority: "low",
        integrity: "sha256-boot",
        nonce: "nonce-4",
      });
      preinitModule("/module-init.js", {
        crossOrigin: "anonymous",
        integrity: "sha256-init",
        nonce: "nonce-5",
      });
    } finally {
      if (settings !== undefined) {
        settings.disableCSSFileLoading = previousSettings.disableCSSFileLoading ?? false;
        settings.disableJavaScriptFileLoading =
          previousSettings.disableJavaScriptFileLoading ?? false;
        settings.handleDisabledFileLoadingAsSuccess =
          previousSettings.handleDisabledFileLoadingAsSuccess ?? false;
      }
    }

    expect(document.head.querySelectorAll('link[rel="preconnect"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="preconnect"]')?.outerHTML).toBe(
      '<link rel="preconnect" href="https://cdn.example.test" crossorigin="anonymous">',
    );
    expect(document.head.querySelector('link[rel="dns-prefetch"]')?.outerHTML).toBe(
      '<link rel="dns-prefetch" href="https://dns.example.test">',
    );
    expect(document.head.querySelector('link[rel="preload"][href="/app.css"]')?.outerHTML).toBe(
      '<link rel="preload" href="/app.css" as="style" fetchpriority="high" integrity="sha256-css" nonce="nonce-1">',
    );
    expect(document.head.querySelector('link[rel="preload"][href="/hero.png"]')?.outerHTML).toBe(
      '<link rel="preload" href="/hero.png" as="image" imagesrcset="/hero@1x.png 1x, /hero@2x.png 2x" imagesizes="100vw">',
    );
    expect(document.head.querySelector('link[rel="modulepreload"][href="/entry.js"]')?.outerHTML)
      .toBe(
        '<link rel="modulepreload" href="/entry.js" as="script" crossorigin="use-credentials" integrity="sha256-module" nonce="nonce-2">',
      );
    expect(document.head.querySelector('link[rel="stylesheet"][href="/critical.css"]')?.outerHTML)
      .toBe(
        '<link rel="stylesheet" href="/critical.css" data-precedence="high" nonce="nonce-3">',
      );
    expect(document.head.querySelector('script[src="/boot.js"]')?.outerHTML).toBe(
      '<script src="/boot.js" async="" crossorigin="anonymous" fetchpriority="low" integrity="sha256-boot" nonce="nonce-4"></script>',
    );
    expect(document.head.querySelector('script[type="module"][src="/module-init.js"]')?.outerHTML)
      .toBe(
        '<script type="module" src="/module-init.js" async="" crossorigin="anonymous" integrity="sha256-init" nonce="nonce-5"></script>',
      );
  });

  test("form APIs expose default status, action state, reset, and batched updates", async () => {
    const container = document.createElement("div");
    let renderCount = 0;

    function FormDemo() {
      renderCount += 1;
      const [count, dispatch, pending] = useFormState(
        (previous: number, payload: number) => previous + payload,
        0,
      );
      const status = useFormStatus();
      return createElement(
        "button",
        {
          onClick: () => {
            unstable_batchedUpdates(() => {
              dispatch(1);
              dispatch(2);
            });
          },
        },
        `${count}:${pending ? "pending" : "ready"}:${status.pending ? "posting" : "idle"}`,
      );
    }

    render(createElement(FormDemo), container);
    expect(container.textContent).toBe("0:ready:idle");
    const initialRenderCount = renderCount;
    container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(container.textContent).toBe("3:ready:idle");
    expect(renderCount).toBe(initialRenderCount + 1);

    const form = document.createElement("form");
    const input = document.createElement("input");
    input.name = "name";
    input.defaultValue = "Ada";
    input.value = "Grace";
    form.append(input);
    requestFormReset(form);
    expect(input.value).toBe("Ada");
  });

  test("server entrypoints expose React-style render APIs", async () => {
    const element = createElement("main", null, createElement("h1", null, "Ada"));

    expect(renderToString(element)).toBe("<main><h1>Ada</h1></main>");
    expect(renderToStaticMarkup(element)).toBe("<main><h1>Ada</h1></main>");

    const readable = await renderToReadableStream(element);
    const reader = readable.getReader();
    const firstChunk = await reader.read();

    expect(firstChunk.done).toBe(false);
    expect(new TextDecoder().decode(firstChunk.value)).toBe("<main><h1>Ada</h1></main>");

    const chunks: string[] = [];
    let ended = false;
    const pipeable = renderToPipeableStream(element, {
      onAllReady() {
        chunks.push("ready");
      },
    });
    pipeable.pipe({
      write(chunk: string | Uint8Array) {
        chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      },
      end() {
        ended = true;
      },
    });
    await Promise.resolve();

    expect(chunks).toEqual(["ready", "<main><h1>Ada</h1></main>"]);
    expect(ended).toBe(true);
  });

  test("server readable stream exposes allReady and bootstrap resources", async () => {
    const element = createElement("main", null, createElement("h1", null, "Ada"));
    const headerNames: string[] = [];
    const readable = await renderToReadableStream(element, {
      nonce: "nonce-1",
      importMap: {
        imports: {
          react: "/vendor/react.js",
        },
      },
      onHeaders(headers) {
        headerNames.push(headers.get("content-type") ?? "");
      },
      bootstrapScriptContent: "globalThis.__boot = '<ready>';",
      bootstrapScripts: [
        "/client.js",
        {
          src: "/chunk.js",
          integrity: "sha256-test",
          crossOrigin: "anonymous",
        },
      ],
      bootstrapModules: ["/module.js"],
    });

    const html = await readStream(readable);
    await readable.allReady;

    expect(html).toContain("<main><h1>Ada</h1></main>");
    expect(html).toContain(
      '<script type="importmap" nonce="nonce-1">{"imports":{"react":"/vendor/react.js"}}</script>',
    );
    expect(html).toContain('<script nonce="nonce-1">globalThis.__boot = \'\\u003cready>');
    expect(html).toContain('<script src="/client.js" nonce="nonce-1"></script>');
    expect(html).toContain(
      '<script src="/chunk.js" nonce="nonce-1" integrity="sha256-test" crossorigin="anonymous"></script>',
    );
    expect(html).toContain('<script type="module" src="/module.js" nonce="nonce-1"></script>');
    expect(headerNames).toEqual(["text/html; charset=utf-8"]);
  });

  test("server resume APIs are streaming-compatible drop-in entrypoints", async () => {
    const element = createElement("section", null, "Resumed");
    const readable = await resume(element, { postponed: true });
    await readable.allReady;
    expect(await readStream(readable)).toBe("<section>Resumed</section>");

    const chunks: string[] = [];
    let ended = false;
    const pipeable = await resumeToPipeableStream(element, { postponed: true }, {
      onShellReady() {
        chunks.push("shell");
      },
      onAllReady() {
        chunks.push("all");
      },
    });

    pipeable.pipe({
      write(chunk: string | Uint8Array) {
        chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      },
      end() {
        ended = true;
      },
    });
    await Promise.resolve();

    expect(chunks).toEqual(["shell", "all", "<section>Resumed</section>"]);
    expect(ended).toBe(true);
  });
});

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      return html;
    }
    html += decoder.decode(chunk.value);
  }
}

function getHappyDomSettings(): Record<string, boolean> | undefined {
  return (window as Window & {
    happyDOM?: { settings: Record<string, boolean> };
  }).happyDOM?.settings;
}
