import { err, ok, type Result } from "neverthrow";
import { isDisplayableItem } from "./format.js";
import type { HnItem, HnUser } from "./types.js";

const baseUrl = "https://hacker-news.firebaseio.com/v0";

export type StoryFeed = "ask" | "best" | "job" | "new" | "show" | "top";

export type HnClientError =
  | { kind: "http"; status: number; url: string }
  | { kind: "network"; message: string; url: string }
  | { kind: "invalid-json"; url: string }
  | { kind: "invalid-data"; message: string; url: string };

type HnClientOptions = {
  fetch?: typeof fetch;
};

const feedPaths: Record<StoryFeed, string> = {
  ask: "askstories",
  best: "beststories",
  job: "jobstories",
  new: "newstories",
  show: "showstories",
  top: "topstories",
};

export function createHnClient(options: HnClientOptions = {}) {
  const fetchImpl = options.fetch ?? fetch;

  async function getStoryIds(feed: StoryFeed, limit: number): Promise<Result<number[], HnClientError>> {
    const url = `${baseUrl}/${feedPaths[feed]}.json`;
    const result = await getJson(url, fetchImpl, parseStoryIds);

    return result.map((ids) => ids.slice(0, Math.max(0, limit)));
  }

  async function getItem(id: number): Promise<Result<HnItem | null, HnClientError>> {
    return getJson(`${baseUrl}/item/${id}.json`, fetchImpl, parseItem);
  }

  async function getStories(feed: StoryFeed, limit: number): Promise<Result<HnItem[], HnClientError>> {
    const idsResult = await getStoryIds(feed, limit);
    if (idsResult.isErr()) return err(idsResult.error);

    const stories: HnItem[] = [];
    for (const id of idsResult.value) {
      const itemResult = await getItem(id);
      if (itemResult.isErr()) continue;

      const item = itemResult.value;
      if (isDisplayableItem(item)) stories.push(item);
    }

    return ok(stories);
  }

  async function getUser(id: string): Promise<Result<HnUser | null, HnClientError>> {
    return getJson(`${baseUrl}/user/${id}.json`, fetchImpl, parseUser);
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

  return ok(value as HnItemWithRequiredId);
}

function parseUser(value: unknown): Result<HnUser | null, string> {
  if (value === null) return ok(null);
  if (!isRecord(value) || typeof value.id !== "string") {
    return err("Expected a user object with a string id.");
  }

  return ok(value as HnUserWithRequiredId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type HnItemWithRequiredId = Record<string, unknown> & HnItem;
type HnUserWithRequiredId = Record<string, unknown> & HnUser;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
