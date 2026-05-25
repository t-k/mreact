import { relative, sep } from "node:path";
import { escapeHtmlAttribute } from "@reckona/mreact-shared/html-escape";

export interface SlotRenderContext {
  consumedSlots: Set<string>;
  namedSlots: Readonly<Record<string, string>>;
}

export interface ShellFile {
  file: string;
  id: string;
  kind: "layout" | "template";
}

export interface RenderedShellParts {
  prefix: string;
  suffix: string;
}

export function createSlotRenderContext(
  namedSlots: Readonly<Record<string, string>> = {},
): SlotRenderContext {
  return {
    consumedSlots: new Set(),
    namedSlots,
  };
}

export function splitLayoutSlot(
  layoutHtml: string,
  slotContext: SlotRenderContext = createSlotRenderContext(),
): RenderedShellParts {
  const html = replaceNamedLayoutSlots(layoutHtml, slotContext);
  const match = findDefaultLayoutSlot(html);

  if (match === null) {
    return { prefix: html, suffix: "" };
  }

  return {
    prefix: html.slice(0, match.index),
    suffix: html.slice(match.index + match[0].length),
  };
}

export function markShellBoundary(html: string, shell: ShellFile): string {
  const attributeName =
    shell.kind === "layout" ? "data-mreact-layout-boundary" : "data-mreact-template-boundary";

  if (html.includes(`${attributeName}=`)) {
    return html;
  }

  return html.replace(
    /<([A-Za-z][^\s/>]*)([^>]*)>/,
    `<$1$2 ${attributeName}="${escapeHtmlAttribute(shell.id)}">`,
  );
}

export function shellBoundaryId(appDir: string, directory: string): string {
  const relativeDirectory = relative(appDir, directory);

  return relativeDirectory === ""
    ? "root"
    : relativeDirectory.replaceAll(sep, "/").replace(/[^A-Za-z0-9_$/-]/g, "_");
}

export function warnUnconsumedRouteSlots(options: {
  appDir: string;
  pageFile: string;
  serverModuleCacheVersion: string | undefined;
  slotContext: SlotRenderContext;
}): void {
  if (options.serverModuleCacheVersion !== undefined) {
    return;
  }

  const slotNames = Object.keys(options.slotContext.namedSlots);
  if (slotNames.length === 0) {
    return;
  }

  const routeLabel = relative(options.appDir, options.pageFile).replaceAll(sep, "/");

  for (const name of slotNames) {
    if (name === "default") {
      console.warn(
        `[mreact] ${routeLabel}: slots.default does not target <Slot />; use the page body for default slot content.`,
      );
      continue;
    }

    if (!options.slotContext.consumedSlots.has(name)) {
      console.warn(
        `[mreact] ${routeLabel}: slots.{${name}} is not consumed by any ancestor layout or template.`,
      );
    }
  }
}

function replaceNamedLayoutSlots(layoutHtml: string, slotContext: SlotRenderContext): string {
  return layoutHtml.replace(SLOT_TAG_PATTERN, (source, openAttributes: string) => {
    const name = readSlotName(openAttributes);

    if (name === undefined || name === "default") {
      return source;
    }

    if (Object.hasOwn(slotContext.namedSlots, name)) {
      slotContext.consumedSlots.add(name);
      return slotContext.namedSlots[name] ?? "";
    }

    return "";
  });
}

const SLOT_TAG_PATTERN = /<slot\b([^>]*)>(?:<\/slot\s*>)?/g;

function findDefaultLayoutSlot(html: string): RegExpExecArray | null {
  SLOT_TAG_PATTERN.lastIndex = 0;

  for (;;) {
    const match = SLOT_TAG_PATTERN.exec(html);

    if (match === null) {
      return null;
    }

    const name = readSlotName(match[1] ?? "");

    if (name === undefined || name === "default") {
      return match;
    }
  }
}

function readSlotName(attributes: string): string | undefined {
  const match = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(attributes);

  return match?.[1] ?? match?.[2];
}
