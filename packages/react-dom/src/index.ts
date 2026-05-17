export {
  createPortal,
  flushSync,
  render,
  unmountComponentAtNode,
  useActionState as useFormState,
} from "@reckona/mreact-compat";
import { runWithEventPriority } from "@reckona/mreact-compat/event-priority";
export { createRoot, hydrateRoot } from "./client.js";
export type { HydrateRootOptions, Root, RootOptions } from "./client.js";

export const version = "19.2.6";

export interface FormStatusNotPending {
  pending: false;
  data: null;
  method: null;
  action: null;
}

export interface FormStatusPending {
  pending: true;
  data: FormData;
  method: string;
  action: string | ((formData: FormData) => void | Promise<void>);
}

export type FormStatus = FormStatusPending | FormStatusNotPending;

export interface PreconnectOptions {
  crossOrigin?: "anonymous" | "use-credentials" | "";
}

export type PreloadAs =
  | "audio"
  | "document"
  | "embed"
  | "fetch"
  | "font"
  | "image"
  | "object"
  | "track"
  | "script"
  | "style"
  | "video"
  | "worker";

export interface PreloadOptions {
  as: PreloadAs;
  crossOrigin?: "anonymous" | "use-credentials" | "";
  fetchPriority?: "high" | "low" | "auto";
  imageSizes?: string;
  imageSrcSet?: string;
  integrity?: string;
  type?: string;
  nonce?: string;
  referrerPolicy?: ReferrerPolicy;
  media?: string;
}

export interface PreloadModuleOptions {
  as?: RequestDestination;
  crossOrigin?: "anonymous" | "use-credentials" | "";
  integrity?: string;
  nonce?: string;
}

export interface PreinitOptions {
  as: "script" | "style";
  crossOrigin?: "anonymous" | "use-credentials" | "";
  fetchPriority?: "high" | "low" | "auto";
  precedence?: string;
  integrity?: string;
  nonce?: string;
}

export interface PreinitModuleOptions {
  as?: "script";
  crossOrigin?: "anonymous" | "use-credentials" | "";
  integrity?: string;
  nonce?: string;
}

type LinkAttributes = Record<string, string | undefined>;

const notPendingFormStatus: FormStatusNotPending = {
  pending: false,
  data: null,
  method: null,
  action: null,
};

export function useFormStatus(): FormStatus {
  return notPendingFormStatus;
}

export function requestFormReset(form: HTMLFormElement): void {
  form.reset();
}

export function unstable_batchedUpdates<T>(callback: () => T): T;
export function unstable_batchedUpdates<TArgument, TResult>(
  callback: (argument: TArgument) => TResult,
  argument: TArgument,
): TResult;
export function unstable_batchedUpdates<TArgument, TResult>(
  callback: ((argument: TArgument) => TResult) | (() => TResult),
  argument?: TArgument,
): TResult {
  return runWithEventPriority("discrete", () =>
    argument === undefined
      ? (callback as () => TResult)()
      : (callback as (argument: TArgument) => TResult)(argument)
  );
}

export function prefetchDNS(href: string): void {
  upsertHeadLink("dns-prefetch", href, {});
}

export function preconnect(href: string, options: PreconnectOptions = {}): void {
  upsertHeadLink("preconnect", href, {
    crossorigin: options.crossOrigin,
  });
}

export function preload(href: string, options: PreloadOptions): void {
  upsertHeadLink("preload", href, {
    as: options.as,
    crossorigin: options.crossOrigin,
    fetchpriority: options.fetchPriority,
    imagesrcset: options.imageSrcSet,
    imagesizes: options.imageSizes,
    integrity: options.integrity,
    media: options.media,
    nonce: options.nonce,
    referrerpolicy: options.referrerPolicy,
    type: options.type,
  });
}

export function preloadModule(href: string, options: PreloadModuleOptions = {}): void {
  upsertHeadLink("modulepreload", href, {
    as: options.as,
    crossorigin: options.crossOrigin,
    integrity: options.integrity,
    nonce: options.nonce,
  });
}

export function preinit(href: string, options: PreinitOptions): void {
  if (options.as === "style") {
    upsertHeadLink("stylesheet", href, {
      "data-precedence": options.precedence,
      crossorigin: options.crossOrigin,
      fetchpriority: options.fetchPriority,
      integrity: options.integrity,
      nonce: options.nonce,
    });
    return;
  }

  upsertHeadScript(href, {
    async: "",
    crossorigin: options.crossOrigin,
    fetchpriority: options.fetchPriority,
    integrity: options.integrity,
    nonce: options.nonce,
  });
}

export function preinitModule(href: string, options: PreinitModuleOptions = {}): void {
  upsertHeadScript(href, {
    type: "module",
    async: "",
    crossorigin: options.crossOrigin,
    integrity: options.integrity,
    nonce: options.nonce,
  });
}

function upsertHeadLink(
  rel: string,
  href: string,
  attributes: LinkAttributes,
): void {
  if (typeof document === "undefined") {
    return;
  }

  const selector = `link[rel="${escapeSelectorValue(rel)}"][href="${escapeSelectorValue(href)}"]`;
  if (document.head.querySelector(selector) !== null) {
    return;
  }

  const link = document.createElement("link");
  link.setAttribute("rel", rel);
  link.setAttribute("href", href);
  applyAttributes(link, attributes);
  document.head.append(link);
}

function upsertHeadScript(
  src: string,
  attributes: LinkAttributes,
): void {
  if (typeof document === "undefined") {
    return;
  }

  const selector = `script[src="${escapeSelectorValue(src)}"]`;
  if (document.head.querySelector(selector) !== null) {
    return;
  }

  const script = document.createElement("script");
  if (attributes.type === "module") {
    script.setAttribute("type", "module");
    script.setAttribute("src", src);
    applyAttributes(script, { ...attributes, type: undefined });
  } else {
    script.setAttribute("src", src);
    applyAttributes(script, attributes);
  }

  document.head.append(script);
}

function applyAttributes(element: Element, attributes: LinkAttributes): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) {
      continue;
    }
    element.setAttribute(name, value);
  }
}

function escapeSelectorValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
