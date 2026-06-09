const deferredLoaderDataSymbol = Symbol.for("mreact.router.deferred-loader-data");

/**
 * Marks loader data that contains streamed deferred values.
 */
export type DeferredLoaderData<TData extends Record<string, unknown>> = TData & {
  readonly [deferredLoaderDataSymbol]: true;
};

/**
 * Marks loader data for deferred streaming without changing its data shape.
 */
export function defer<TData extends Record<string, unknown>>(
  data: TData,
): DeferredLoaderData<TData> {
  markTopLevelPromisesHandled(data);

  return Object.defineProperty(data, deferredLoaderDataSymbol, {
    enumerable: false,
    value: true,
  }) as DeferredLoaderData<TData>;
}

/**
 * Checks whether loader data was marked with `defer()`.
 */
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
      // Avoid process-level unhandled rejection noise before <Await> attaches
      // its boundary handlers. Callers should still render every deferred
      // promise through <Await catch>; unused rejected fields will not surface
      // as unhandled rejections.
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
