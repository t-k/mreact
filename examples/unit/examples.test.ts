// @vitest-environment happy-dom

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { beforeEach, describe, expect, test } from "vitest";
import { transform, type ServerOutputMode } from "../../packages/compiler/src/index.js";
import {
  runClientComponent,
  runServerComponent,
  runServerStreamComponent,
} from "../../packages/compiler/test/helpers.js";
import { applyPromo, cartStore, resetCart, setQuantity } from "../store/src/store.ts";
import {
  PHOTO_COUNT,
  createVirtualGallery,
  photoAt,
  visiblePhotoIds,
} from "../virtual-grid/src/gallery.ts";

const examplesRoot = join(process.cwd(), "examples");

describe("reactive-primitives examples", () => {
  test("counter updates through the rendered buttons", async () => {
    const node = await renderClientExample("reactive-primitives/src/Counter.tsx");
    const buttons = (node as HTMLElement).querySelectorAll("button");

    expect(node.textContent).toContain("count: 0");

    buttons[0]?.click();
    await flushEffects();
    expect(node.textContent).toContain("count: 1");

    buttons[1]?.click();
    await flushEffects();
    expect(node.textContent).toContain("count: 0");
  });

  test("computed values update when an input changes", async () => {
    const node = await renderClientExample("reactive-primitives/src/Derived.tsx");
    const inputs = (node as HTMLElement).querySelectorAll("input");

    expect(node.textContent).toContain("Ada Lovelace");

    inputText(inputs[0], "Grace");
    await flushEffects();
    expect(node.textContent).toContain("Grace Lovelace");
  });

  test("effects append a log entry after state changes", async () => {
    const node = await renderClientExample("reactive-primitives/src/Effect.tsx");
    const button = (node as HTMLElement).querySelector("button");

    expect(node.textContent).toContain("tick=0");

    button?.click();
    await flushEffects();
    expect(node.textContent).toContain("tick=1");
  });
});

describe("store example", () => {
  beforeEach(() => {
    resetCart();
  });

  test("cart actions clamp quantities, apply promo codes, and reset state", () => {
    setQuantity("book", 3);
    setQuantity("shirt", -2);
    applyPromo("MREACT10");

    const updated = cartStore.get();
    expect(updated.lines.find((line) => line.id === "book")?.quantity).toBe(3);
    expect(updated.lines.find((line) => line.id === "shirt")?.quantity).toBe(0);
    expect(updated.promoCode).toBe("MREACT10");

    resetCart();
    const reset = cartStore.get();
    expect(reset.lines.find((line) => line.id === "book")?.quantity).toBe(1);
    expect(reset.promoCode).toBeNull();
  });
});

describe("virtual-grid example", () => {
  test("keeps the 500-photo gallery projection bounded at the top, middle, and end", () => {
    const gallery = createVirtualGallery();

    expect(PHOTO_COUNT).toBe(500);
    expect(visiblePhotoIds(gallery)).toEqual([
      "photo-000",
      "photo-001",
      "photo-002",
      "photo-003",
      "photo-004",
      "photo-005",
      "photo-006",
      "photo-007",
      "photo-008",
      "photo-009",
      "photo-010",
      "photo-011",
      "photo-012",
      "photo-013",
      "photo-014",
    ]);

    gallery.scrollToOffset(2_400);
    expect(gallery.entries.get()).toHaveLength(21);
    expect(gallery.visibleRange.get()).toMatchObject({
      startIndex: 60,
      endIndex: 69,
    });

    gallery.scrollToIndex(PHOTO_COUNT - 1);
    const tailIds = visiblePhotoIds(gallery);
    expect(tailIds.at(-1)).toBe("photo-499");
    expect(tailIds[0]).toBe("photo-486");
    expect(tailIds.length).toBe(14);

    gallery.scrollToTop();
    expect(visiblePhotoIds(gallery)[0]).toBe("photo-000");
  });

  test("photo fixtures expose stable IDs, titles, and color swatches", () => {
    expect(photoAt(0)).toMatchObject({
      id: "photo-000",
      title: "Harbor morning",
    });
    expect(photoAt(499)).toMatchObject({
      id: "photo-499",
      title: "Signal lantern",
    });
  });
});

describe("ssr-streaming examples", () => {
  test("string output renders the static SSR page", async () => {
    const output = await transformServerExample(
      "ssr-streaming/src/StringPage.tsx",
      "string",
    );

    expect(runServerComponent(output)).toContain("<h1>Hello SSR</h1>");
  });

  test("stream output escapes dynamic text", async () => {
    const output = await transformServerExample(
      "ssr-streaming/src/StreamPage.tsx",
      "stream",
    );

    await expect(runServerStreamComponent(output)).resolves.toContain(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  test("await boundaries render resolved and rejected content", async () => {
    const output = await transformServerExample(
      "ssr-streaming/src/AwaitPage.tsx",
      "stream",
    );
    const html = await runServerStreamComponent(output);

    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("failed: network down");
  });
});

describe("example configuration contracts", () => {
  test("react-compat aliases React imports to mreact packages", async () => {
    const viteConfig = await readExample("react-compat/vite.config.ts");

    expect(viteConfig).toContain('"react"');
    expect(viteConfig).toContain("@reckona/mreact-compat");
    expect(viteConfig).toContain('"react-dom/client"');
    expect(viteConfig).toContain("@reckona/mreact-dom/client");
  });

  test("selective-hydration wires server boundaries to the client manifest", async () => {
    const server = await readExample("selective-hydration/server.ts");
    const client = await readExample("selective-hydration/src/client-entry.ts");

    expect(server).toContain("renderHydrationBoundary");
    expect(server).toContain('"App:0"');
    expect(client).toContain("manifestRoot: document");
  });
});

async function renderClientExample(relativePath: string): Promise<Node> {
  const output = transform({
    code: await readExample(relativePath),
    filename: join(examplesRoot, relativePath),
    target: "client",
    dev: true,
  });

  expect(output.diagnostics).toEqual([]);
  return await runClientComponent(output.code);
}

async function transformServerExample(
  relativePath: string,
  serverOutput: ServerOutputMode,
): Promise<string> {
  const output = transform({
    code: await readExample(relativePath),
    filename: join(examplesRoot, relativePath),
    target: "server",
    serverOutput,
    dev: true,
  });

  expect(output.diagnostics).toEqual([]);
  return output.code;
}

async function readExample(relativePath: string): Promise<string> {
  return await readFile(join(examplesRoot, relativePath), "utf8");
}

function inputText(input: Element | undefined, value: string): void {
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected input element.");
  }

  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
