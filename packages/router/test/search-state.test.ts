import { afterEach, describe, expect, it, vi } from "vitest";
import { defineSearchState, searchParam } from "../src/search-state.js";

const projects = defineSearchState({
  status: searchParam.oneOf(["open", "closed"] as const, "open"),
  page: searchParam.integer(1, { min: 1 }),
  sort: searchParam.oneOf(["updated", "name"] as const, "updated"),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("typed URL search state", () => {
  it("validates values, reports invalid keys, and uses defaults", () => {
    expect(projects.parse("?status=closed&page=3&sort=name")).toEqual({
      value: { status: "closed", page: 3, sort: "name" },
      invalid: [],
    });
    expect(projects.parse("?status=unknown&page=0&sort=name&extra=secret")).toEqual({
      value: { status: "open", page: 1, sort: "name" },
      invalid: ["status", "page", "extra"],
    });
    expect(projects.parse("?page=2&page=3")).toEqual({
      value: { status: "open", page: 1, sort: "updated" },
      invalid: ["page"],
    });
    expect(projects.parse(new URLSearchParams("page=4")).value.page).toBe(4);
    expect(projects.parse("page=5").value.page).toBe(5);
  });

  it("omits default values and creates a stable URL", () => {
    expect(projects.format({ status: "open", page: 3, sort: "updated" })).toBe("?page=3");
    expect(projects.format({ status: "closed", page: 1, sort: "name" })).toBe("?status=closed&sort=name");
    expect(projects.format({ status: "open", page: 1, sort: "updated" })).toBe("");
    expect(() => projects.format({ status: "open", page: Number.NaN, sort: "updated" })).toThrow();
  });

  it("rejects invalid field defaults and unsafe integer input", () => {
    expect(() => searchParam.oneOf(["open"] as const, "closed" as "open")).toThrow();
    expect(() => searchParam.integer(0, { min: 1 })).toThrow();
    expect(projects.parse("?page=9007199254740992").invalid).toEqual(["page"]);
    expect(projects.parse("?page=+2").invalid).toEqual(["page"]);
    expect(projects.parse("?page=2a").invalid).toEqual(["page"]);
    expect(() => projects.format({ status: "other" as "open", page: 1, sort: "updated" })).toThrow();
    const bounded = defineSearchState({ level: searchParam.integer(2, { min: 1, max: 3 }) });
    expect(bounded.parse("?level=4")).toEqual({ value: { level: 2 }, invalid: ["level"] });
    expect(bounded.parse("?level=3").value.level).toBe(3);
    expect(() => bounded.format({ level: 4 })).toThrow();
  });

  it("reads defaults without a browser and does not write without a location", async () => {
    expect(projects.get().value).toEqual({ status: "open", page: 1, sort: "updated" });
    expect(await projects.set({ page: 2 })).toBe(false);
    const unsubscribe = projects.subscribe("page", vi.fn());
    expect(unsubscribe()).toBeUndefined();
  });

  it("writes through the supplied navigator and distinguishes push and replace", async () => {
    const navigate = vi.fn(async () => true);
    vi.stubGlobal("location", new URL("https://example.test/projects?page=2#list"));
    const state = defineSearchState({ page: searchParam.integer(1, { min: 1 }) }, { navigate });

    expect(await state.set({ page: 3 }, { history: "replace" })).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/projects?page=3#list", { type: "replace" });
    expect(await state.set({ page: 4 })).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/projects?page=4#list", { type: "push" });
  });

  it("uses the installed router navigator and reports unavailable navigation", async () => {
    vi.stubGlobal("location", new URL("https://example.test/projects"));
    const navigate = vi.fn(async () => true);
    vi.stubGlobal("__mreactNavigate", navigate);
    expect(await projects.set({ page: 2 })).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/projects?page=2", { type: "push" });
    vi.stubGlobal("__mreactNavigate", undefined);
    expect(await projects.set({ page: 2 })).toBe(false);
  });

  it("serializes overlapping partial writes so later writes see the committed URL", async () => {
    const current = new URL("https://example.test/projects");
    vi.stubGlobal("location", current);
    let finishFirst!: () => void;
    const navigate = vi.fn((target: string) => {
      if (navigate.mock.calls.length === 1) {
        return new Promise<boolean>((resolve) => {
          finishFirst = () => {
            current.href = new URL(target, current.href).href;
            resolve(true);
          };
        });
      }
      current.href = new URL(target, current.href).href;
      return Promise.resolve(true);
    });
    const schema = {
      page: searchParam.integer(1, { min: 1 }),
      sort: searchParam.oneOf(["updated", "name"] as const, "updated"),
    };
    const pageState = defineSearchState(schema, { navigate });
    const sortState = defineSearchState(schema, { navigate });

    const first = pageState.set({ page: 2 });
    const second = sortState.set({ sort: "name" });
    await Promise.resolve();
    expect(navigate).toHaveBeenCalledOnce();
    finishFirst();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(navigate).toHaveBeenLastCalledWith("/projects?page=2&sort=name", { type: "push" });
    expect(current.search).toBe("?page=2&sort=name");
  });

  it("notifies only fields whose parsed value changes after a committed URL", () => {
    const listeners = new Map<string, Set<EventListener>>();
    const target = {
      addEventListener: (name: string, listener: EventListener) => {
        const set = listeners.get(name) ?? new Set<EventListener>();
        set.add(listener);
        listeners.set(name, set);
      },
      removeEventListener: (name: string, listener: EventListener) => listeners.get(name)?.delete(listener),
      dispatchEvent: (event: Event) => {
        for (const listener of listeners.get(event.type) ?? []) listener(event);
      },
    };
    const current = new URL("https://example.test/projects?page=1&sort=updated");
    vi.stubGlobal("window", target);
    vi.stubGlobal("location", current);
    const page = vi.fn();
    const sort = vi.fn();
    const stopPage = projects.subscribe("page", page);
    const stopSort = projects.subscribe("sort", sort);

    current.search = "?page=1&sort=name";
    target.dispatchEvent(new Event("mreact:url-commit"));
    expect(page).not.toHaveBeenCalled();
    expect(sort).toHaveBeenCalledOnce();
    expect(sort).toHaveBeenCalledWith("name");

    current.search = "?page=2&sort=name";
    target.dispatchEvent(new Event("mreact:url-commit"));
    expect(page).toHaveBeenCalledWith(2);
    expect(sort).toHaveBeenCalledOnce();
    stopPage();
    stopSort();
    current.search = "?page=3&sort=updated";
    target.dispatchEvent(new Event("mreact:url-commit"));
    expect(page).toHaveBeenCalledOnce();
    expect(sort).toHaveBeenCalledOnce();
  });
});
