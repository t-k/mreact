import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { renderAppRequest, type RenderAppRequestOptions } from "@modular-react/router";

export interface AppFixture {
  readonly appDir: string;
  render(path: string, options?: AppFixtureRenderOptions | undefined): Promise<Response>;
  write(path: string, contents: string): Promise<void>;
}

export type AppFixtureRenderOptions = Omit<RenderAppRequestOptions, "appDir" | "request"> & {
  request?: RequestInit | undefined;
  origin?: string | undefined;
};

export interface DehydratedQueryState {
  queries: Array<{
    data: unknown;
    queryHash: string;
    queryKey: readonly unknown[];
    updatedAt: number;
  }>;
}

const queryStateScriptPattern =
  /<script\b[^>]*\bid=(?:"__mreact_query_state"|'__mreact_query_state')[^>]*>([\s\S]*?)<\/script>/i;

export async function createAppFixture(prefix = "mreact-app-fixture"): Promise<AppFixture> {
  const appDir = await mkdtemp(join(tmpdir(), `${prefix}-`));

  return {
    appDir,
    render(path, options = {}) {
      const origin = options.origin ?? "http://local.test";
      const request = new Request(new URL(path, origin), options.request);
      const { origin: _origin, request: _request, ...routerOptions } = options;

      void _origin;
      void _request;

      return renderAppRequest({
        ...routerOptions,
        appDir,
        request,
      });
    },
    async write(path, contents) {
      const file = join(appDir, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, contents);
    },
  };
}

export async function responseText(response: Response): Promise<string> {
  return response.text();
}

export function readQueryState(html: string): DehydratedQueryState | undefined {
  const encoded = queryStateScriptPattern.exec(html)?.[1];

  if (encoded === undefined) {
    return undefined;
  }

  return JSON.parse(unescapeJsonForHtml(encoded)) as DehydratedQueryState;
}

function unescapeJsonForHtml(value: string): string {
  return value
    .replaceAll("\\u003c", "<")
    .replaceAll("\\u003e", ">")
    .replaceAll("\\u0026", "&")
    .replaceAll("\\u2028", "\u2028")
    .replaceAll("\\u2029", "\u2029");
}
