import { deleteCookie, parseCookieHeader, serializeCookie, setCookie } from "./cookies.js";

/**
 * Stores session data and expiration metadata for one session id.
 */
export interface SessionRecord<TData = unknown> {
  createdAt: number;
  data: TData;
  expiresAt: number;
  id: string;
  rotatedAt?: number;
}

/**
 * Defines the persistence API used by app-router session helpers.
 */
export interface SessionStore<TData = unknown> {
  delete(id: string): void | Promise<void>;
  get(id: string): SessionRecord<TData> | undefined | Promise<SessionRecord<TData> | undefined>;
  set(record: SessionRecord<TData>): void | Promise<void>;
}

/**
 * Configures the process-local memory session store.
 */
export interface MemorySessionStoreOptions {
  maxEntries?: number;
  sweepIntervalMs?: number;
}

/**
 * Configures the cookie used by app-router session helpers.
 */
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

function usesHardenedCookieDefaults(): boolean {
  const nodeEnv = typeof process === "undefined" ? undefined : process["env"]?.["NODE_ENV"];
  return nodeEnv !== "development" && nodeEnv !== "test";
}

function resolveSessionCookie(options: SessionCookieOptions = {}) {
  const hardened = usesHardenedCookieDefaults();
  const cookieOptions = {
    httpOnly: true,
    maxAge: options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS,
    path: options.path ?? "/",
    sameSite: options.sameSite ?? "Lax",
    secure: options.secure ?? hardened,
  } as const;
  const canUseHostPrefix = cookieOptions.secure && cookieOptions.path === "/";

  return {
    name:
      options.cookieName ??
      (hardened && canUseHostPrefix ? SESSION_COOKIE_PROD : SESSION_COOKIE_DEV),
    options: cookieOptions,
  };
}

function validateResolvedSessionCookie(cookie: ReturnType<typeof resolveSessionCookie>): void {
  serializeCookie(cookie.name, "", cookie.options);
}

function assertMutableResponseHeaders(response: Response): void {
  const probeName = "x-mreact-session-header-probe";
  const previous = response.headers.get(probeName);

  try {
    response.headers.set(probeName, "1");
    if (previous === null) {
      response.headers.delete(probeName);
    } else {
      response.headers.set(probeName, previous);
    }
  } catch (cause) {
    throw new TypeError("Session helpers require a Response with mutable headers.", { cause });
  }
}

function readSessionId(request: Request, options: SessionCookieOptions = {}): string | undefined {
  const cookie = resolveSessionCookie(options);
  const values = parseCookieHeader(request.headers.get("cookie"));
  return values.get(cookie.name);
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

/**
 * Creates a process-local session store backed by an in-memory LRU-like map.
 *
 * Use it for development, tests, or single-process deployments; production multi-instance deployments should provide a shared `SessionStore`.
 */
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

/**
 * Reads the current session cookie, loads the matching session record, and deletes expired records.
 */
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

/**
 * Creates a new session record, stores it, and appends the session cookie to the response.
 */
export async function createSession<TData>(
  response: Response,
  store: SessionStore<TData>,
  data: TData,
  options: SessionCookieOptions = {},
): Promise<SessionRecord<TData>> {
  const now = Date.now();
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const cookie = resolveSessionCookie({ ...options, maxAgeSeconds });
  validateResolvedSessionCookie(cookie);
  assertMutableResponseHeaders(response);
  const record: SessionRecord<TData> = {
    createdAt: now,
    data,
    expiresAt: now + maxAgeSeconds * 1000,
    id: createSessionId(),
  };

  await store.set(record);
  setCookie(response, cookie.name, record.id, cookie.options);

  return record;
}

/**
 * Deletes the current session record when present and appends an expiring session cookie to the response.
 */
export async function destroySession<TData>(
  request: Request,
  response: Response,
  store: SessionStore<TData>,
  options: SessionCookieOptions = {},
): Promise<void> {
  const cookie = resolveSessionCookie(options);
  validateResolvedSessionCookie({
    name: cookie.name,
    options: { ...cookie.options, maxAge: 0 },
  });
  assertMutableResponseHeaders(response);
  const id = readSessionId(request, options);

  if (id !== undefined) {
    await store.delete(id);
  }

  deleteCookie(response, cookie.name, {
    path: cookie.options.path,
    sameSite: cookie.options.sameSite,
    secure: cookie.options.secure,
  });
}

/**
 * Replaces the current session id while preserving the stored session data.
 *
 * Use this after authentication or privilege changes to reduce session fixation risk.
 */
export async function rotateSession<TData>(
  request: Request,
  response: Response,
  store: SessionStore<TData>,
  options: SessionCookieOptions = {},
): Promise<SessionRecord<TData> | undefined> {
  validateResolvedSessionCookie(resolveSessionCookie(options));
  assertMutableResponseHeaders(response);
  const current = await getSession(request, store, options);

  if (current === undefined) {
    return undefined;
  }

  await store.delete(current.id);
  const next = await createSession(response, store, current.data, options);

  return { ...next, rotatedAt: Date.now() };
}
