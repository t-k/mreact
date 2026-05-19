export type InferLoaderData<TLoader extends (...args: never[]) => unknown> = Awaited<
  ReturnType<TLoader>
>;
