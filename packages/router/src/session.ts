import { deleteCookie, parseCookieHeader, setCookie } from "./cookies.js";

export interface SessionRecord<TData = unknown> {
  createdAt: number;
  data: TData;
  expiresAt: number;
  id: string;
  rotatedAt?: number;
}

export interface SessionStore<TData = unknown> {
  delete(id: string): void | Promise<void>;
  get(id: string): SessionRecord<TData> | undefined | Promise<SessionRecord<TData> | undefined>;
  set(record: SessionRecord<TData>): void | Promise<void>;
}

export interface MemorySessionStoreOptions {
  maxEntries?: number;
  sweepIntervalMs?: number;
}

export interface SessionCookieOptions {
  cookieName?: string;
  maxAgeSeconds?: number;
  path?: string;
  sameSite?: "Strict" | "Lax" | "None";
  secure?: boolean;
}

const DEFAULT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const SESSION_COOKIE_DEV = "mreact.session";
const SESSION_COOKIE_PROD = "__Host-mreact.session";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function defaultCookieName(): string {
  return isProduction() ? SESSION_COOKIE_PROD : SESSION_COOKIE_DEV;
}

function sessionCookieOptions(options: SessionCookieOptions = {}) {
  const production = isProduction();

  return {
    httpOnly: true,
    maxAge: options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS,
    path: production ? "/" : options.path ?? "/",
    sameSite: options.sameSite ?? "Lax",
    secure: options.secure ?? production,
  } as const;
}

function readSessionId(
  request: Request,
  options: SessionCookieOptions = {},
): string | undefined {
  const values = parseCookieHeader(request.headers.get("cookie"));
  return values.get(options.cookieName ?? defaultCookieName());
}

function createSessionId(): string {
  const bytes = new Uint8Array(32);

  globalThis.crypto.getRandomValues(bytes);

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createMemorySessionStore<TData>(
  options: MemorySessionStoreOptions = {},
): SessionStore<TData> {
  const maxEntries = positiveIntegerOrDefault(options.maxEntries, 100_000);
  const sweepIntervalMs = nonNegativeIntegerOrDefault(options.sweepIntervalMs, 60_000);
  const records = new Map<string, SessionRecord<TData>>();
  let nextSweepAt = 0;

  function sweepExpired(now: number): void {
    for (const [id, value] of records) {
      if (value.expiresAt <= now) {
        records.delete(id);
      }
    }

    nextSweepAt = now + sweepIntervalMs;
  }

  function maybeSweepExpired(now: number): void {
    if (sweepIntervalMs === 0 || now >= nextSweepAt) {
      sweepExpired(now);
    }
  }

  function evictOldestEntries(): void {
    while (records.size > maxEntries) {
      const oldestId = records.keys().next().value;

      if (oldestId === undefined) {
        return;
      }

      records.delete(oldestId);
    }
  }

  return {
    delete(id) {
      records.delete(id);
    },
    get(id) {
      const now = Date.now();
      maybeSweepExpired(now);
      const record = records.get(id);

      if (record !== undefined && record.expiresAt <= now) {
        records.delete(id);
        return undefined;
      }

      if (record !== undefined) {
        records.delete(id);
        records.set(id, record);
      }

      return record;
    },
    set(record) {
      const now = Date.now();
      maybeSweepExpired(now);

      records.delete(record.id);
      records.set(record.id, record);

      if (records.size > maxEntries) {
        sweepExpired(now);
        evictOldestEntries();
      }
    },
  };
}

function positiveIntegerOrDefault(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isInteger(value) || value < 1 ? fallback : value;
}

function nonNegativeIntegerOrDefault(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isInteger(value) || value < 0 ? fallback : value;
}

export async function getSession<TData>(
  request: Request,
  store: SessionStore<TData>,
  options: SessionCookieOptions = {},
): Promise<SessionRecord<TData> | undefined> {
  const id = readSessionId(request, options);

  if (id === undefined || id.length === 0) {
    return undefined;
  }

  const record = await store.get(id);

  if (record === undefined) {
    return undefined;
  }

  if (record.expiresAt <= Date.now()) {
    await store.delete(id);
    return undefined;
  }

  return record;
}

export async function createSession<TData>(
  response: Response,
  store: SessionStore<TData>,
  data: TData,
  options: SessionCookieOptions = {},
): Promise<SessionRecord<TData>> {
  const now = Date.now();
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const record: SessionRecord<TData> = {
    createdAt: now,
    data,
    expiresAt: now + maxAgeSeconds * 1000,
    id: createSessionId(),
  };

  await store.set(record);
  setCookie(response, options.cookieName ?? defaultCookieName(), record.id, {
    ...sessionCookieOptions({ ...options, maxAgeSeconds }),
  });

  return record;
}

export async function destroySession<TData>(
  request: Request,
  response: Response,
  store: SessionStore<TData>,
  options: SessionCookieOptions = {},
): Promise<void> {
  const id = readSessionId(request, options);

  if (id !== undefined) {
    await store.delete(id);
  }

  deleteCookie(response, options.cookieName ?? defaultCookieName(), {
    path: isProduction() ? "/" : options.path ?? "/",
    sameSite: options.sameSite ?? "Lax",
    secure: options.secure ?? isProduction(),
  });
}

export async function rotateSession<TData>(
  request: Request,
  response: Response,
  store: SessionStore<TData>,
  options: SessionCookieOptions = {},
): Promise<SessionRecord<TData> | undefined> {
  const current = await getSession(request, store, options);

  if (current === undefined) {
    return undefined;
  }

  await store.delete(current.id);
  const next = await createSession(response, store, current.data, options);

  return { ...next, rotatedAt: Date.now() };
}
