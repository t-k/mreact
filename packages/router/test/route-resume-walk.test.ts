import { describe, expect, test } from "vitest";
// @vitest-environment happy-dom

import { routeHydrationRuntimeInlineSource } from "../src/route-hydration-runtime.js";

/**
 * Behaviour of the reconciliation walk itself, executed rather than pattern matched.
 *
 * `route-shared-hydration-runtime.test.ts` asserts which helper text a route entry
 * carries; nothing executed the helpers, so the walk was only ever covered through
 * a full build or a browser run. These tests evaluate the emitted runtime source in
 * a DOM and pin the properties an allocation rewrite can silently break: the loops
 * iterate `attributes` and `childNodes`, both live collections, while removing
 * attributes and moving nodes out of the very collection they are walking. A copy
 * taken before iteration hides that; an index walk over the live collection does
 * not, and skips elements once the collection shifts under it.
 */
interface ResumeRuntime {
  readonly resumeChildren: (current: Element, next: Element) => void;
  readonly resumeNode: (current: Node, next: Node) => void;
  readonly resumeRoute: (marker: Element, nextNode: Node) => void;
  readonly syncAttributes: (current: Element, next: Element) => void;
  readonly unmountCompatBoundaries: (root: Node) => void;
}

/**
 * The runtime ships as source text, so a test reaches it the way a route entry does:
 * by evaluating the emitted declarations and injecting the two route-scoped binding
 * synchronisers the resume factory expects.
 */
function createResumeRuntime(
  syncEventBindings: (current: Element, next: Element) => void = () => undefined,
  syncDomRefBindings: (current: Element, next: Element) => void = () => undefined,
): ResumeRuntime {
  const source = [
    routeHydrationRuntimeInlineSource("lifecycle"),
    routeHydrationRuntimeInlineSource("resume"),
    `return {
      resumeChildren: __mreactResumeChildren,
      resumeNode: __mreactResumeNode,
      resumeRoute: __mreactResumeRoute,
      syncAttributes: __mreactSyncAttributes,
      unmountCompatBoundaries: __mreactUnmountCompatBoundaries,
    };`,
  ].join("\n");

  // The runtime is emitted source text, so evaluating it is the only way to test the
  // shipped walk rather than a hand-kept copy of it.
  const factory = new Function(
    "__mreactSyncEventBindings",
    "__mreactSyncDomRefBindings",
    source,
  ) as (syncEvents: unknown, syncDomRefs: unknown) => ResumeRuntime;

  return factory(syncEventBindings, syncDomRefBindings);
}

function element(markup: string): Element {
  const host = document.createElement("div");
  host.innerHTML = markup;
  const first = host.firstElementChild;

  if (first === null) {
    throw new Error(`markup produced no element: ${markup}`);
  }

  return first;
}

describe("route resume walk attribute synchronisation", () => {
  test("removes every server attribute the client node does not carry", () => {
    const runtime = createResumeRuntime();
    const current = element('<p one="1" two="2" three="3" four="4" five="5"></p>');
    const next = element("<p></p>");

    runtime.syncAttributes(current, next);

    expect(current.getAttributeNames()).toEqual([]);
  });

  test("removes interleaved server attributes without skipping the ones after them", () => {
    const runtime = createResumeRuntime();
    const current = element('<p drop-a="a" keep-a="1" drop-b="b" keep-b="2" drop-c="c"></p>');
    const next = element('<p keep-a="1" keep-b="2"></p>');

    runtime.syncAttributes(current, next);

    expect(current.getAttributeNames()).toEqual(["keep-a", "keep-b"]);
    expect(current.getAttribute("keep-a")).toBe("1");
    expect(current.getAttribute("keep-b")).toBe("2");
  });

  test("copies the client attributes the server never rendered", () => {
    const runtime = createResumeRuntime();
    const current = element('<p kept="server"></p>');
    const next = element('<p kept="server" added="client" also="client"></p>');

    runtime.syncAttributes(current, next);

    expect(current.getAttributeNames()).toEqual(["kept", "added", "also"]);
    expect(current.getAttribute("added")).toBe("client");
  });

  test("keeps the surviving server attributes ahead of the newly copied ones", () => {
    const runtime = createResumeRuntime();
    const current = element('<p first="1" dropped="x" second="2"></p>');
    const next = element('<p second="2" first="1" third="3"></p>');

    runtime.syncAttributes(current, next);

    expect(current.getAttributeNames()).toEqual(["first", "second", "third"]);
  });

  test("updates an attribute whose value the client changed", () => {
    const runtime = createResumeRuntime();
    const current = element('<p data-index="0000" class="row"></p>');
    const next = element('<p data-index="9999" class="row"></p>');

    runtime.syncAttributes(current, next);

    expect(current.getAttribute("data-index")).toBe("9999");
    expect(current.getAttribute("class")).toBe("row");
  });

  test("writes no attribute when the server and client nodes already agree", () => {
    const runtime = createResumeRuntime();
    const current = element('<p data-index="0000" class="row"></p>');
    const next = element('<p data-index="0000" class="row"></p>');
    const writes: string[] = [];
    current.setAttribute = new Proxy(current.setAttribute, {
      apply(target, thisArgument, argumentsList: [string, string]) {
        writes.push(argumentsList[0]);
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    });
    const removals: string[] = [];
    current.removeAttribute = new Proxy(current.removeAttribute, {
      apply(target, thisArgument, argumentsList: [string]) {
        removals.push(argumentsList[0]);
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    });

    runtime.syncAttributes(current, next);

    expect(writes).toEqual([]);
    expect(removals).toEqual([]);
  });

  test("synchronises an element that carries no attributes on either side", () => {
    const runtime = createResumeRuntime();
    const current = element("<p></p>");
    const next = element("<p></p>");

    runtime.syncAttributes(current, next);

    expect(current.getAttributeNames()).toEqual([]);
  });
});

describe("route resume walk child resume", () => {
  test("resumes every client child when only some of them move into the server node", () => {
    const runtime = createResumeRuntime();
    // The <em> replaces the server <b> and so leaves the client node mid-walk, while
    // the span, the text and both <i> children stay put. A walk that reads the client
    // child list by live index skips one child for every child that leaves.
    const current = element("<div><span>a</span><b>x</b>keep<i>1</i><i>2</i></div>");
    const next = element("<div><span>a</span><em>x</em>keep<i>1</i><i>2</i></div>");

    runtime.resumeChildren(current, next);

    expect(current.innerHTML).toBe("<span>a</span><em>x</em>keep<i>1</i><i>2</i>");
  });

  test("resumes the children after a replaced node when several children move out", () => {
    const runtime = createResumeRuntime();
    const current = element("<div><b>1</b><b>2</b><b>3</b><b>4</b></div>");
    const next = element("<div><em>1</em><em>2</em><em>3</em><em>4</em></div>");

    runtime.resumeChildren(current, next);

    expect(current.innerHTML).toBe("<em>1</em><em>2</em><em>3</em><em>4</em>");
  });

  test("appends the client children the server never rendered", () => {
    const runtime = createResumeRuntime();
    const current = element("<div><i>1</i></div>");
    const next = element("<div><i>1</i><i>2</i><i>3</i></div>");

    runtime.resumeChildren(current, next);

    expect(current.innerHTML).toBe("<i>1</i><i>2</i><i>3</i>");
  });

  test("removes the trailing server children the client no longer renders", () => {
    const runtime = createResumeRuntime();
    const current = element("<div><i>1</i><i>2</i><i>3</i><i>4</i></div>");
    const next = element("<div><i>1</i><i>2</i></div>");

    runtime.resumeChildren(current, next);

    expect(current.innerHTML).toBe("<i>1</i><i>2</i>");
  });

  test("counts the client children that stayed when trimming the server tail", () => {
    const runtime = createResumeRuntime();
    // Two client children leave the client node during the walk and two stay, so a
    // tail trim that measures the client child list after the walk trims too much.
    const current = element("<div><b>1</b><i>2</i><b>3</b><i>4</i><i>5</i><i>6</i></div>");
    const next = element("<div><em>1</em><i>2</i><em>3</em><i>4</i></div>");

    runtime.resumeChildren(current, next);

    expect(current.innerHTML).toBe("<em>1</em><i>2</i><em>3</em><i>4</i>");
  });

  test("keeps the server DOM under an async boundary comment", () => {
    const runtime = createResumeRuntime();
    const current = element("<div><i>resolved</i><i>after</i></div>");
    const next = element("<div><i>after</i></div>");
    next.insertBefore(document.createComment("mreact-async-boundary"), next.firstChild);

    runtime.resumeChildren(current, next);

    expect(current.innerHTML).toBe("<i>resolved</i><i>after</i>");
  });

  test("replaces a reactive text child so later updates reach the live node", () => {
    const runtime = createResumeRuntime();
    const current = element("<div>server<i>tail</i></div>");
    const next = element("<div>client<i>tail</i></div>");
    const reactiveText = next.firstChild as Text & { __mreactReactiveText?: boolean };
    reactiveText.__mreactReactiveText = true;

    runtime.resumeChildren(current, next);

    expect(current.firstChild).toBe(reactiveText);
    expect(current.innerHTML).toBe("client<i>tail</i>");
  });

  test("replaces every text child when the client node owns event bindings", () => {
    const runtime = createResumeRuntime();
    const current = element("<div>one<i>x</i>two</div>");
    const next = element("<div>ONE<i>x</i>TWO</div>") as Element & { __mreactHasEvents?: boolean };
    next.__mreactHasEvents = true;
    const firstClientText = next.firstChild;
    const lastClientText = next.lastChild;

    runtime.resumeChildren(current, next);

    expect(current.firstChild).toBe(firstClientText);
    expect(current.lastChild).toBe(lastClientText);
    expect(current.innerHTML).toBe("ONE<i>x</i>TWO");
  });

  test("replaces a dynamic node so reactive updates mutate the live range", () => {
    const runtime = createResumeRuntime();
    const current = element("<div><i>stale</i><i>tail</i></div>");
    const next = element("<div><i>live</i><i>tail</i></div>");
    const dynamic = next.firstChild as Element & { __mreactDynamicNode?: boolean };
    dynamic.__mreactDynamicNode = true;

    runtime.resumeChildren(current, next);

    expect(current.firstChild).toBe(dynamic);
    expect(current.innerHTML).toBe("<i>live</i><i>tail</i>");
  });

  test("unmounts the compat roots under the server children it trims", () => {
    const runtime = createResumeRuntime();
    const current = element(
      '<div><i>1</i><span data-mreact-compat-boundary="Widget"></span></div>',
    );
    const next = element("<div><i>1</i></div>");
    let unmounted = 0;
    const boundary = current.lastElementChild as Element & { __mreactCompatRoot?: unknown };
    boundary.__mreactCompatRoot = {
      unmount() {
        unmounted += 1;
      },
    };

    runtime.resumeChildren(current, next);

    expect(unmounted).toBe(1);
    expect(current.innerHTML).toBe("<i>1</i>");
  });

  test("resumes a nested list without disturbing any row", () => {
    const runtime = createResumeRuntime();
    const rows = Array.from(
      { length: 32 },
      (_unused, index) =>
        `<li class="row" data-index="${String(index).padStart(4, "0")}"><span class="label">Item ${index}</span><span class="meta">meta ${index}</span></li>`,
    ).join("");
    const current = element(`<ul id="list">${rows}</ul>`);
    const next = element(`<ul id="list">${rows}</ul>`);

    runtime.resumeNode(current, next);

    expect(current.innerHTML).toBe(rows);
  });
});
