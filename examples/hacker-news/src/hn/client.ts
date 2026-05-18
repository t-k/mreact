import { err, ok, type Result } from "neverthrow";
import { isDisplayableItem } from "./format.js";
import type { HnItem, HnItemType, HnUser } from "./types.js";

const baseUrl = "https://hacker-news.firebaseio.com/v0";

export type StoryFeed = "ask" | "best" | "job" | "new" | "show" | "top";

export type HnClientError =
  | { kind: "http"; status: number; url: string }
  | { kind: "network"; message: string; url: string }
  | { kind: "invalid-json"; url: string }
  | { kind: "invalid-data"; message: string; url: string };

export type HnClientOptions = {
  fetch?: typeof fetch;
};

export interface HnClient {
  getItem(id: number): Promise<Result<HnItem | null, HnClientError>>;
  getStories(feed: StoryFeed, limit: number): Promise<Result<HnItem[], HnClientError>>;
  getStoryIds(feed: StoryFeed, limit: number): Promise<Result<number[], HnClientError>>;
  getUser(id: string): Promise<Result<HnUser | null, HnClientError>>;
}

const feedPaths: Record<StoryFeed, string> = {
  ask: "askstories",
  best: "beststories",
  job: "jobstories",
  new: "newstories",
  show: "showstories",
  top: "topstories",
};

const hnItemTypes = new Set<HnItemType>(["job", "story", "comment", "poll", "pollopt"]);

export function createHnClient(options: HnClientOptions = {}): HnClient {
  const fetchImpl = options.fetch ?? fetch;

  async function getStoryIds(
    feed: StoryFeed,
    limit: number,
  ): Promise<Result<number[], HnClientError>> {
    const url = `${baseUrl}/${feedPaths[feed]}.json`;
    const result = await getJson(url, fetchImpl, parseStoryIds);

    return result.map((ids) => ids.slice(0, Math.max(0, limit)));
  }

  async function getItem(id: number): Promise<Result<HnItem | null, HnClientError>> {
    const url = `${baseUrl}/item/${String(id)}.json`;
    if (!Number.isInteger(id) || id < 0) {
      return err({
        kind: "invalid-data",
        message: "Expected item id to be a non-negative integer.",
        url,
      });
    }

    return getJson(url, fetchImpl, parseItem);
  }

  async function getStories(
    feed: StoryFeed,
    limit: number,
  ): Promise<Result<HnItem[], HnClientError>> {
    const idsResult = await getStoryIds(feed, limit);
    if (idsResult.isErr()) return err(idsResult.error);

    const stories: HnItem[] = [];
    for (const id of idsResult.value) {
      const itemResult = await getItem(id);
      // Story lists tolerate per-item failures because HN items can disappear or fail independently.
      if (itemResult.isErr()) continue;

      const item = itemResult.value;
      if (isDisplayableItem(item)) stories.push(item);
    }

    return ok(stories);
  }

  async function getUser(id: string): Promise<Result<HnUser | null, HnClientError>> {
    return getJson(`${baseUrl}/user/${encodeURIComponent(id)}.json`, fetchImpl, parseUser);
  }

  return { getItem, getStories, getStoryIds, getUser };
}

export const hn = createHnClient();

async function getJson<T>(
  url: string,
  fetchImpl: typeof fetch,
  parse: (value: unknown) => Result<T, string>,
): Promise<Result<T, HnClientError>> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    return err({ kind: "network", message: getErrorMessage(error), url });
  }

  if (!response.ok) return err({ kind: "http", status: response.status, url });

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return err({ kind: "invalid-json", url });
  }

  const parsed = parse(value);
  if (parsed.isErr()) return err({ kind: "invalid-data", message: parsed.error, url });

  return ok(parsed.value);
}

function parseStoryIds(value: unknown): Result<number[], string> {
  if (!Array.isArray(value) || !value.every((id) => Number.isInteger(id))) {
    return err("Expected an array of story ids.");
  }

  return ok(value);
}

function parseItem(value: unknown): Result<HnItem | null, string> {
  if (value === null) return ok(null);
  if (!isRecord(value) || !Number.isInteger(value.id)) {
    return err("Expected an item object with a numeric id.");
  }

  const error = validateItemFields(value);
  if (error !== null) return err(error);

  return ok(value as unknown as HnItem);
}

function parseUser(value: unknown): Result<HnUser | null, string> {
  if (value === null) return ok(null);
  if (!isRecord(value) || typeof value.id !== "string") {
    return err("Expected a user object with a string id.");
  }

  const error = validateUserFields(value);
  if (error !== null) return err(error);

  return ok(value as unknown as HnUser);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateItemFields(value: Record<string, unknown>): string | null {
  return (
    validateOptional(value, "by", isString) ??
    validateOptional(value, "dead", isBoolean) ??
    validateOptional(value, "deleted", isBoolean) ??
    validateOptional(value, "descendants", isInteger) ??
    validateOptional(value, "kids", isIntegerArray) ??
    validateOptional(value, "parent", isInteger) ??
    validateOptional(value, "parts", isIntegerArray) ??
    validateOptional(value, "poll", isInteger) ??
    validateOptional(value, "score", isInteger) ??
    validateOptional(value, "text", isString) ??
    validateOptional(value, "time", isInteger) ??
    validateOptional(value, "title", isString) ??
    validateOptional(value, "type", isHnItemType) ??
    validateOptional(value, "url", isString)
  );
}

function validateUserFields(value: Record<string, unknown>): string | null {
  return (
    validateOptional(value, "about", isString) ??
    validateOptional(value, "created", isInteger) ??
    validateOptional(value, "delay", isInteger) ??
    validateOptional(value, "karma", isInteger) ??
    validateOptional(value, "submitted", isIntegerArray)
  );
}

function validateOptional(
  value: Record<string, unknown>,
  field: string,
  isValid: (fieldValue: unknown) => boolean,
): string | null {
  if (!(field in value) || isValid(value[field])) return null;

  return `Expected ${field} to have a valid Hacker News API type.`;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isInteger(value: unknown): value is number {
  return Number.isInteger(value);
}

function isIntegerArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item));
}

function isHnItemType(value: unknown): value is HnItemType {
  return typeof value === "string" && hnItemTypes.has(value as HnItemType);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
