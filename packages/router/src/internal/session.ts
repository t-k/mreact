import {
  createMemorySessionStore as createMemorySessionStoreInternal,
  createSession as createSessionInternal,
  destroySession as destroySessionInternal,
  getSession as getSessionInternal,
  rotateSession as rotateSessionInternal,
} from "../session.js";
import type {
  MemorySessionStoreOptions as MemorySessionStoreOptionsInternal,
  SessionCookieOptions as SessionCookieOptionsInternal,
  SessionRecord as SessionRecordInternal,
  SessionStore as SessionStoreInternal,
} from "../session.js";

/**
 * Stores session data and expiration metadata for one session id.
 */
export type SessionRecord<TData = unknown> = SessionRecordInternal<TData>;
/**
 * Defines the persistence API used by app-router session helpers.
 */
export type SessionStore<TData = unknown> = SessionStoreInternal<TData>;
/**
 * Configures the process-local memory session store.
 */
export type MemorySessionStoreOptions = MemorySessionStoreOptionsInternal;
/**
 * Configures the cookie used by app-router session helpers.
 */
export type SessionCookieOptions = SessionCookieOptionsInternal;
/**
 * Creates a process-local session store backed by an in-memory LRU-like map.
 */
export const createMemorySessionStore = createMemorySessionStoreInternal;
/**
 * Reads the current session cookie, loads the matching session record, and deletes expired records.
 */
export const getSession = getSessionInternal;
/**
 * Creates a new session record, stores it, and appends the session cookie to the response.
 */
export const createSession = createSessionInternal;
/**
 * Deletes the current session record when present and appends an expiring session cookie to the response.
 */
export const destroySession = destroySessionInternal;
/**
 * Replaces the current session id while preserving the stored session data.
 */
export const rotateSession = rotateSessionInternal;
