import {
  createPortal,
  flushSync,
  render,
  unmountComponentAtNode,
  useActionState as useFormState,
} from "@reckona/mreact-compat";
import { runWithEventPriority } from "@reckona/mreact-compat/event-priority";
import { createRoot, hydrateRoot } from "./client.js";

/** Re-exports the React DOM rendering helpers exposed by the root entrypoint. */
export {
  createPortal,
  flushSync,
  render,
  unmountComponentAtNode,
  useFormState,
  createRoot,
  hydrateRoot,
};
export type { HydrateRootOptions, Root, RootOptions } from "./client.js";

/** React DOM-compatible package version. */
export const version = "19.2.6";

/** Idle form status returned when no form submission is pending. */
export interface FormStatusNotPending {
  pending: false;
  data: null;
  method: null;
  action: null;
}

/** Pending form status returned while a submission is in progress. */
export interface FormStatusPending {
  pending: true;
  data: FormData;
  method: string;
  action: string | ((formData: FormData) => void | Promise<void>);
}

/** Current form submission state returned by useFormStatus. */
export type FormStatus = FormStatusPending | FormStatusNotPending;

/** Options applied when inserting a preconnect resource hint. */
export interface PreconnectOptions {
  crossOrigin?: "anonymous" | "use-credentials" | "";
}

/** Allowed destination values for preload resource hints. */
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

/** Options applied when inserting a preload resource hint. */
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

/** Options applied when inserting a modulepreload resource hint. */
export interface PreloadModuleOptions {
  as?: RequestDestination;
  crossOrigin?: "anonymous" | "use-credentials" | "";
  integrity?: string;
  nonce?: string;
}

/** Options applied when preinitializing a script or stylesheet resource. */
export interface PreinitOptions {
  as: "script" | "style";
  crossOrigin?: "anonymous" | "use-credentials" | "";
  fetchPriority?: "high" | "low" | "auto";
  precedence?: string;
  integrity?: string;
  nonce?: string;
}

/** Options applied when preinitializing a JavaScript module resource. */
export interface PreinitModuleOptions {
  as?: "script";
  crossOrigin?: "anonymous" | "use-credentials" | "";
  integrity?: string;
  nonce?: string;
}

type LinkAttributes = Record<string, string | undefined>;

/** Returns the current form submission status for the nearest form action. */
export function useFormStatus(): FormStatus {
  throw new Error(
    "useFormStatus is not supported by @reckona/mreact-dom yet. Use useFormState/useActionState for local pending state instead.",
  );
}

/** Resets a form element after a server action-style submission completes. */
export function requestFormReset(form: HTMLFormElement): void {
  form.reset();
}

/** Runs a callback at discrete event priority and returns its result. */
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

/** Inserts a dns-prefetch link for the provided host if it is not already present. */
export function prefetchDNS(href: string): void {
  upsertHeadLink("dns-prefetch", href, {});
}

/** Inserts a preconnect link for the provided origin if it is not already present. */
export function preconnect(href: string, options: PreconnectOptions = {}): void {
  upsertHeadLink("preconnect", href, {
    crossorigin: options.crossOrigin,
  });
}

/** Inserts a preload link for the provided resource if it is not already present. */
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

/** Inserts a modulepreload link for the provided module if it is not already present. */
export function preloadModule(href: string, options: PreloadModuleOptions = {}): void {
  upsertHeadLink("modulepreload", href, {
    as: options.as,
    crossorigin: options.crossOrigin,
    integrity: options.integrity,
    nonce: options.nonce,
  });
}

/** Preinitializes a script or stylesheet resource in the document head. */
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

/** Preinitializes a JavaScript module resource in the document head. */
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

/** React DOM-compatible default export object. */
const ReactDOM = {
  createPortal,
  flushSync,
  render,
  unmountComponentAtNode,
  useFormState,
  createRoot,
  hydrateRoot,
  version,
  useFormStatus,
  requestFormReset,
  unstable_batchedUpdates,
  prefetchDNS,
  preconnect,
  preload,
  preloadModule,
  preinit,
  preinitModule,
} as const;

export default ReactDOM;
