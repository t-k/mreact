import {
  createElement,
  type ReactCompatElement,
  type ReactCompatNode,
} from "@reckona/mreact-compat";

export type LinkPrefetch = "intent" | "viewport" | "none" | false;
export type LinkScroll = "top" | "preserve";
export type LinkTransition = "auto" | "none" | false;

export interface LinkOptions {
  href: string;
  prefetch?: LinkPrefetch | undefined;
  reload?: boolean | undefined;
  scroll?: LinkScroll | undefined;
  transition?: LinkTransition | undefined;
}

export interface LinkProps extends LinkOptions {
  children?: ReactCompatNode;
  [attribute: string]: unknown;
}

export function linkProps(options: LinkOptions): Record<string, string> {
  return {
    href: options.href,
    ...(options.prefetch === undefined || options.prefetch === "intent"
      ? {}
      : { "data-mreact-prefetch": options.prefetch === false ? "none" : options.prefetch }),
    ...(options.reload === true ? { "data-mreact-reload": "true" } : {}),
    ...(options.scroll === undefined || options.scroll === "top"
      ? {}
      : { "data-mreact-scroll": options.scroll }),
    ...(options.transition === undefined || options.transition === false || options.transition === "none"
      ? {}
      : { "data-mreact-transition": options.transition }),
  };
}

export function Link(props: LinkProps): ReactCompatElement {
  const { href, prefetch, reload, scroll, transition, ...rest } = props;

  return createElement("a", {
    ...rest,
    ...linkProps({ href, prefetch, reload, scroll, transition }),
  });
}
