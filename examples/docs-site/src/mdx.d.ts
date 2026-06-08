declare module "*.mdx" {
  import type { ReactElement } from "@reckona/mreact";
  import type { RouteMetadata } from "@reckona/mreact-router";

  export const description: string | undefined;
  export const title: string | undefined;
  const Content: () => ReactElement | null;
  export default Content;
  export const metadata: RouteMetadata | undefined;
}

declare module "*.css";
