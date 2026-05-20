const deferredLoaderDataSymbol = Symbol.for("mreact.router.deferred-loader-data");

export type DeferredLoaderData<TData extends Record<string, unknown>> = TData & {
  readonly [deferredLoaderDataSymbol]: true;
};

export function defer<TData extends Record<string, unknown>>(
  data: TData,
): DeferredLoaderData<TData> {
  markTopLevelPromisesHandled(data);

  return Object.defineProperty(data, deferredLoaderDataSymbol, {
    enumerable: false,
    value: true,
  }) as DeferredLoaderData<TData>;
}

export function isDeferredLoaderData(
  value: unknown,
): value is DeferredLoaderData<Record<string, unknown>> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [deferredLoaderDataSymbol]?: unknown })[deferredLoaderDataSymbol] === true
  );
}

export function unwrapDeferredLoaderData<TData extends Record<string, unknown>>(
  data: DeferredLoaderData<TData>,
): TData {
  return data;
}

function markTopLevelPromisesHandled(data: Record<string, unknown>): void {
  for (const value of Object.values(data)) {
    if (isPromiseLike(value)) {
      void Promise.resolve(value).catch(() => {});
    }
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
