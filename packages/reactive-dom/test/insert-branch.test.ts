// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { withCleanupScope } from "@reckona/mreact-reactive-core/internal";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindDomRef, insertDynamic } from "../src/index.js";
import { insertBranch } from "../src/insert-branch.js";
import { registerDispose } from "../src/scope.js";
import type { RenderValue } from "../src/types.js";

/** Runs the same scenario through both insertions so the contracts stay aligned. */
function bothInsertions(): readonly [
  "insertBranch" | "insertDynamic",
  typeof insertDynamic,
][] {
  return [
    ["insertBranch", insertBranch],
    ["insertDynamic", insertDynamic],
  ];
}

describe("insertBranch", () => {
  test("replaces only the range before the marker and clears it on disposal", async () => {
    for (const [name, insert] of bothInsertions()) {
      const value = cell<RenderValue>("first");
      const parent = document.createElement("div");
      const before = document.createTextNode("before:");
      const marker = document.createComment("marker");
      const after = document.createTextNode(":after");

      parent.append(before, marker, after);
      const dispose = insert(parent, marker, () => value.get());

      expect(parent.textContent, name).toBe("before:first:after");

      const strong = document.createElement("strong");
      strong.textContent = "node";
      value.set([strong, 2]);
      await flushEffects();

      expect(parent.innerHTML, name).toBe("before:<strong>node</strong>2<!--marker-->:after");

      value.set(null);
      await flushEffects();

      expect(parent.textContent, name).toBe("before::after");

      dispose();
      value.set("ignored");
      await flushEffects();

      expect(parent.textContent, name).toBe("before::after");
    }
  });

  test("does not remove and reinsert the same node instance", async () => {
    const node = document.createElement("strong");
    node.textContent = "stable";
    const value = cell({ node });
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertBranch(parent, marker, () => value.get().node);
    expect(parent.firstChild).toBe(node);

    value.set({ node });
    await flushEffects();

    expect(parent.firstChild).toBe(node);
    expect(parent.innerHTML).toBe("<strong>stable</strong><!--marker-->");

    dispose();
  });

  test("disposes the previous branch before evaluating its replacement", async () => {
    const events: string[] = [];
    const selected = cell("a");
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertBranch(parent, marker, () => {
      const branch = selected.get();
      registerDispose(() => events.push(`dispose:${branch}`));
      events.push(`render:${branch}`);
      return document.createTextNode(branch);
    });

    selected.set("b");
    await flushEffects();

    expect(events).toEqual(["render:a", "dispose:a", "render:b"]);
    expect(parent.textContent).toBe("b");

    dispose();
  });

  test("clears the stopped branch when evaluating its replacement throws", async () => {
    const selected = cell<"ready" | "error">("ready");
    const events: string[] = [];
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertBranch(parent, marker, () => {
      const branch = selected.get();
      registerDispose(() => events.push(`dispose:${branch}`));

      if (branch === "error") {
        throw new Error("replacement failed");
      }

      return document.createTextNode(branch);
    });

    selected.set("error");

    await expect(flushEffects()).rejects.toThrow("replacement failed");
    expect(events).toEqual(["dispose:ready", "dispose:error"]);
    expect(parent.innerHTML).toBe("<!--marker-->");

    dispose();
  });

  test("completes branch replacement after the previous cleanup throws", async () => {
    const value = cell("a");
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);
    document.body.append(parent);
    const dispose = insertBranch(parent, marker, () => {
      const section = document.createElement("section");
      section.textContent = value.get();
      bindDomRef(section, () => () => {
        if (section.textContent === "a") {
          throw new Error("cleanup failed");
        }
      });
      return section;
    });
    await Promise.resolve();

    value.set("b");

    await expect(flushEffects()).rejects.toThrow("cleanup failed");
    expect(parent.innerHTML).toBe("<section>b</section><!--marker-->");
    dispose();
    parent.remove();
  });

  test("does not throw when the marker has been removed before a queued update", async () => {
    const value = cell<RenderValue>("first");
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertBranch(parent, marker, () => value.get());
    expect(parent.textContent).toBe("first");

    marker.remove();
    value.set("second");

    await expect(flushEffects()).resolves.toBeUndefined();
    expect(parent.textContent).toBe("");

    dispose();
  });

  test("continues updating when a fragment marker is moved into the document", async () => {
    const value = cell<RenderValue>("first");
    const fragment = document.createDocumentFragment();
    const marker = document.createComment("marker");
    const host = document.createElement("div");

    fragment.append(marker);
    const dispose = insertBranch(fragment, marker, () => value.get());
    host.append(fragment);
    await flushEffects();

    expect(host.innerHTML).toBe("first<!--marker-->");

    value.set("second");
    await flushEffects();

    expect(host.innerHTML).toBe("second<!--marker-->");

    dispose();
  });

  test("clears the current branch when its reactive cleanup owner is disposed", () => {
    const events: string[] = [];
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);
    const ownerDisposers: Array<() => void> = [];

    withCleanupScope(
      (dispose) => {
        ownerDisposers.push(dispose);
      },
      () =>
        insertBranch(parent, marker, () => {
          registerDispose(() => events.push("cleanup"));
          return document.createTextNode("owned");
        }),
    );

    for (const dispose of ownerDisposers) {
      dispose();
    }

    expect(events).toEqual(["cleanup"]);
    expect(parent.innerHTML).toBe("<!--marker-->");
  });

  test("marks the marker and every mounted node while dynamic hydration is enabled", () => {
    const hydrationState = globalThis as typeof globalThis & {
      __mreactHydratingDynamicRanges?: boolean;
    };
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);
    hydrationState.__mreactHydratingDynamicRanges = true;

    try {
      const dispose = insertBranch(parent, marker, () => document.createTextNode("hydrated"));
      const mounted = parent.firstChild as Text & { __mreactDynamicNode?: true };

      expect((marker as Comment & { __mreactDynamicNode?: true }).__mreactDynamicNode).toBe(true);
      expect(mounted.__mreactDynamicNode).toBe(true);
      dispose();
    } finally {
      delete hydrationState.__mreactHydratingDynamicRanges;
    }
  });

  test("reports a cleanup failure raised while disposing the whole branch", () => {
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertBranch(parent, marker, () => {
      registerDispose(() => {
        throw new Error("owner cleanup failed");
      });
      return document.createTextNode("owned");
    });

    expect(() => dispose()).toThrow("owner cleanup failed");
    expect(parent.innerHTML).toBe("<!--marker-->");
  });

  test("leaves nodes unmarked while dynamic hydration is disabled", () => {
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertBranch(parent, marker, () => document.createTextNode("plain"));
    const mounted = parent.firstChild as Text & { __mreactDynamicNode?: true };

    expect(
      (marker as Comment & { __mreactDynamicNode?: true }).__mreactDynamicNode,
    ).toBeUndefined();
    expect(mounted.__mreactDynamicNode).toBeUndefined();
    dispose();
  });

  test("replaces the mounted range when the node list grows or shrinks", async () => {
    const first = document.createElement("b");
    first.textContent = "first";
    const second = document.createElement("i");
    second.textContent = "second";
    const value = cell<RenderValue>([first]);
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertBranch(parent, marker, () => value.get());

    expect(parent.innerHTML).toBe("<b>first</b><!--marker-->");

    value.set([first, second]);
    await flushEffects();
    expect(parent.innerHTML).toBe("<b>first</b><i>second</i><!--marker-->");

    value.set([second]);
    await flushEffects();
    expect(parent.innerHTML).toBe("<i>second</i><!--marker-->");

    dispose();
    expect(parent.innerHTML).toBe("<!--marker-->");
  });

  test("labels its effect when a debug label is supplied", async () => {
    const value = cell("a");
    const parent = document.createElement("div");
    const marker = document.createComment("marker");
    parent.append(marker);

    const dispose = insertBranch(parent, marker, () => document.createTextNode(value.get()), {
      debugLabel: "App#branch",
    });

    expect(parent.textContent).toBe("a");
    value.set("b");
    await flushEffects();
    expect(parent.textContent).toBe("b");

    dispose();
  });
});
