import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  batchAsync,
  cell,
  computed,
  type Cell,
  type ReadonlyCell,
} from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { createRoot, type Dispose, type RenderValue } from "@reckona/mreact-reactive-dom";
import {
  isNotFoundError,
  isRedirectError,
  renderAppRequest,
  type RenderAppRequestOptions,
} from "@reckona/mreact-router";

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

export interface ComponentRenderResult {
  readonly container: HTMLElement;
  rerender(value: ComponentRenderInput): void;
  unmount(): void;
}

export type ComponentRenderInput = RenderValue | (() => RenderValue);

export type RouteHandler<TContext = undefined> = (
  request: Request,
  context: TContext,
) => Response | Promise<Response>;

export interface ComponentRenderOptions {
  container?: HTMLElement | undefined;
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

export async function invokeRouteHandler<TContext = undefined>(
  handler: RouteHandler<TContext>,
  request: Request,
  context?: TContext,
): Promise<Response> {
  try {
    const response = await handler(request, context as TContext);

    return response instanceof Response
      ? response
      : new Response("Invalid route response", { status: 500 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    if (isRedirectError(error)) {
      return new Response(null, {
        headers: { location: error.location },
        status: error.status,
      });
    }

    if (isNotFoundError(error)) {
      return new Response("Not Found", { status: 404 });
    }

    throw error;
  }
}

export function render(
  value: ComponentRenderInput,
  options: ComponentRenderOptions = {},
): ComponentRenderResult {
  const container = options.container ?? document.createElement("div");
  let current = value;
  let dispose = mountComponent(container, current);

  return {
    container,
    rerender(next) {
      dispose();
      current = next;
      dispose = mountComponent(container, current);
    },
    unmount() {
      dispose();
    },
  };
}

export async function act<T>(fn: () => Promise<T> | T): Promise<T> {
  const result = await batchAsync(fn);
  await flushReactive();
  return result;
}

export async function flushReactive(): Promise<void> {
  await flushEffects();
}

export function createCellMock<T>(initial: T): Cell<T> {
  return cell(initial);
}

export function createComputedMock<T>(fn: () => T): ReadonlyCell<T> {
  return computed(fn);
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

function mountComponent(container: HTMLElement, value: ComponentRenderInput): Dispose {
  return createRoot(container, () => (typeof value === "function" ? value() : value));
}
