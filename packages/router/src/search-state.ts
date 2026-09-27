/** A codec for one URL search value with an explicit default. */
export interface SearchParam<T> {
  readonly defaultValue: T;
  parse(value: string): T | undefined;
  format(value: T): string;
}

/** Common validated search parameter codecs. */
export const searchParam = {
  oneOf<const T extends string>(values: readonly T[], defaultValue: T): SearchParam<T> {
    const allowed = new Set(values);
    if (!allowed.has(defaultValue)) throw new Error("Search default is not an allowed value");
    return {
      defaultValue,
      parse(value) {
        return allowed.has(value as T) ? value as T : undefined;
      },
      format(value) {
        if (!allowed.has(value)) throw new Error("Search value is not allowed");
        return value;
      },
    };
  },
  integer(defaultValue: number, options: { min?: number; max?: number } = {}): SearchParam<number> {
    const valid = (value: number) => Number.isSafeInteger(value)
      && (options.min === undefined || value >= options.min)
      && (options.max === undefined || value <= options.max);
    if (!valid(defaultValue)) throw new Error("Search default is not a valid integer");
    return {
      defaultValue,
      parse(value) {
        if (!/^-?(?:0|[1-9]\d*)$/.test(value)) return undefined;
        const parsed = Number(value);
        return valid(parsed) ? parsed : undefined;
      },
      format(value) {
        if (!valid(value)) throw new Error("Search value is not a valid integer");
        return String(value);
      },
    };
  },
};

/** A map of named URL search codecs. */
export type SearchSchema = Record<string, SearchParam<unknown>>;
/** Infers the validated values of a URL search schema. */
export type SearchValue<T extends SearchSchema> = { [K in keyof T]: T[K] extends SearchParam<infer V> ? V : never };
const pendingWrites = new WeakMap<object, Promise<unknown>>();

/** A parsed URL search state and the keys that had invalid or unknown values. */
export interface ParsedSearchState<T> {
  value: T;
  invalid: readonly string[];
}

/** A typed search state that writes through client navigation. */
export interface DefinedSearchState<T extends object> {
  parse(search: string | URLSearchParams): ParsedSearchState<T>;
  format(value: T): string;
  get(): ParsedSearchState<T>;
  set(patch: Partial<T>, options?: { history?: "push" | "replace" }): Promise<boolean>;
  subscribe<K extends keyof T>(key: K, listener: (value: T[K]) => void): () => void;
}

/** Defines validated URL state with default omission and per-field commit listeners. */
export function defineSearchState<T extends SearchSchema>(
  schema: T,
  options: { navigate?: (url: string, options: { type: "push" | "replace" }) => Promise<boolean> } = {},
): DefinedSearchState<SearchValue<T>> {
  type Value = SearchValue<T>;
  const fields = Object.keys(schema) as Array<keyof T & string>;

  function parse(search: string | URLSearchParams): ParsedSearchState<Value> {
    const params = typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;
    const value = {} as Value;
    const invalid: string[] = [];
    for (const key of fields) {
      const field = schema[key]!;
      const values = params.getAll(key);
      if (values.length === 0) {
        value[key] = field.defaultValue as Value[typeof key];
        continue;
      }
      const parsed = values.length === 1 ? field.parse(values[0]!) : undefined;
      if (parsed === undefined) invalid.push(key);
      value[key] = (parsed === undefined ? field.defaultValue : parsed) as Value[typeof key];
    }
    for (const key of params.keys()) {
      if (!Object.hasOwn(schema, key) && !invalid.includes(key)) invalid.push(key);
    }
    return { value, invalid };
  }

  function format(value: Value): string {
    const params = new URLSearchParams();
    for (const key of fields) {
      const field = schema[key]!;
      const current = value[key];
      if (!Object.is(current, field.defaultValue)) {
        params.set(key, field.format(current));
      }
    }
    const encoded = params.toString();
    return encoded === "" ? "" : `?${encoded}`;
  }

  const get = (): ParsedSearchState<Value> => parse(
    typeof location === "undefined" ? "" : location.search,
  );

  return {
    parse,
    format,
    get,
    set(patch, writeOptions = {}) {
      if (typeof location === "undefined") return Promise.resolve(false);
      const browserLocation = location;
      const previous = pendingWrites.get(browserLocation) ?? Promise.resolve();
      const write = previous.then(async () => {
        const current = new URL(browserLocation.href);
        const next = { ...parse(current.search).value, ...patch } as Value;
        const target = `${current.pathname}${format(next)}${current.hash}`;
        const navigate = options.navigate ?? defaultNavigate;
        return navigate(target, { type: writeOptions.history ?? "push" });
      });
      pendingWrites.set(browserLocation, write.then(() => undefined, () => undefined));
      return write;
    },
    subscribe(key, listener) {
      if (typeof window === "undefined") return () => undefined;
      let previous = get().value[key];
      const onCommit = () => {
        const next = get().value[key];
        if (Object.is(previous, next)) return;
        previous = next;
        listener(next);
      };
      window.addEventListener("mreact:url-commit", onCommit);
      return () => window.removeEventListener("mreact:url-commit", onCommit);
    },
  };
}

async function defaultNavigate(url: string, options: { type: "push" | "replace" }): Promise<boolean> {
  const navigate = (globalThis as { __mreactNavigate?: typeof defaultNavigate }).__mreactNavigate;
  return typeof navigate === "function" ? navigate(url, options) : false;
}
