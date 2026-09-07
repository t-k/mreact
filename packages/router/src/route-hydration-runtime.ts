/**
 * The route-independent half of a generated client route entry, shared by both emission shapes.
 *
 * `buildClientRouteEntrySource` used to inline every hydration helper into each route entry, so a five route session downloaded five byte-identical copies of the same resume walk. The helpers now live here once. A build that can hoist them - the multi-route batch build - imports them as virtual modules and gets a single shared chunk; a build that produces one bundle anyway, such as the navigation runtime or a dev route module, keeps inlining the same text, which costs a batch build nothing and keeps a single-bundle build byte-identical to the pre-split output.
 *
 * The split is per capability rather than one always-loaded runtime. A route that cannot stream out-of-order fragments and a route without client references import neither of those groups, a route whose component is provably undefined imports no resume walk at all, and the route-scoped event and dom-ref synchronisers stay generated in the entry and are injected into the resume factory so a route without dom refs never pulls `getDomRefBindings`.
 */

/** Runtime groups, one per independently importable capability. */
export type RouteHydrationRuntimeModule = "boundaries" | "fragments" | "lifecycle" | "resume";

const routeHydrationRuntimeSpecifierPrefix = "mreact-route-hydration-runtime/";

const routeHydrationRuntimeModules: readonly RouteHydrationRuntimeModule[] = [
  "boundaries",
  "fragments",
  "lifecycle",
  "resume",
];

/** Bundler namespace used for the resolved virtual modules. */
export const routeHydrationRuntimeNamespace = "mreact-route-hydration-runtime";

/** Matches every specifier this module can serve, for bundler `onResolve` filters. */
export const routeHydrationRuntimeSpecifierFilter =
  /^mreact-route-hydration-runtime\/(?:boundaries|fragments|lifecycle|resume)$/u;

/** Import specifier a generated route entry uses to reach one runtime group. */
export function routeHydrationRuntimeSpecifier(module: RouteHydrationRuntimeModule): string {
  return `${routeHydrationRuntimeSpecifierPrefix}${module}`;
}

/** Resolves a specifier or a bundler path back to a runtime group name. */
export function routeHydrationRuntimeModuleFor(
  specifierOrPath: string,
): RouteHydrationRuntimeModule | undefined {
  const name = specifierOrPath.startsWith(routeHydrationRuntimeSpecifierPrefix)
    ? specifierOrPath.slice(routeHydrationRuntimeSpecifierPrefix.length)
    : specifierOrPath;

  return routeHydrationRuntimeModules.find((candidate) => candidate === name);
}

/** Helper declarations of one group, for entries that inline the runtime. */
export function routeHydrationRuntimeInlineSource(module: RouteHydrationRuntimeModule): string {
  return routeHydrationRuntimeParts[module];
}

/** Source of one virtual runtime module, for entries that import the runtime. */
export function routeHydrationRuntimeSource(module: RouteHydrationRuntimeModule): string {
  switch (module) {
    case "boundaries": {
      return `${clientBoundaryRuntimeFactoryPrologue}${indentRuntimePart(routeHydrationRuntimeParts.boundaries)}${clientBoundaryRuntimeFactoryEpilogue}`;
    }
    case "resume": {
      return `${routeResumeRuntimeFactoryPrologue}${indentRuntimePart(routeHydrationRuntimeParts.resume)}${routeResumeRuntimeFactoryEpilogue}`;
    }
    default: {
      return `export ${routeHydrationRuntimeParts[module]}`;
    }
  }
}

function indentRuntimePart(source: string): string {
  return source
    .split("\n")
    .map((line) => (line === "" ? line : `  ${line}`))
    .join("\n");
}

const routeResumeRuntimeFactoryPrologue = `import { __mreactRunLifecycleTasks } from "mreact-route-hydration-runtime/lifecycle";

/**
 * Builds the route resume walk around one route's binding synchronisers.
 *
 * The synchronisers stay generated per route because their shape follows the route capabilities, so they are injected instead of imported here. Every helper below is reachable from the returned resumeRoute, which keeps the closure free of code a route cannot run.
 */
export function __mreactCreateRouteResumeRuntime(__mreactSyncEventBindings, __mreactSyncDomRefBindings) {
`;

const routeResumeRuntimeFactoryEpilogue = `
  return {
    resumeNode: __mreactResumeNode,
    resumeRoute: __mreactResumeRoute,
    unmountCompatBoundaries: __mreactUnmountCompatBoundaries,
  };
}
`;

const clientBoundaryRuntimeFactoryPrologue = `/**
 * Builds the client boundary hydration helpers around one route's compat entry points.
 *
 * The compat createRoot/createElement pair is injected so a route without a compat client reference never imports the compat runtime.
 */
export function __mreactCreateClientBoundaryRuntime(__mreactCompatCreateRoot, __mreactCompatCreateElement) {
`;

const clientBoundaryRuntimeFactoryEpilogue = `
  return {
    hasNonSerializableClientBoundaries: __mreactHasNonSerializableClientBoundaries,
    hydrateClientBoundaries: __mreactHydrateClientBoundaries,
  };
}
`;

const routeHydrationRuntimeParts: Record<RouteHydrationRuntimeModule, string> = {
  boundaries: `function __mreactHydrateClientBoundaries(marker, references, components) {
  if (components.size === 0 && (!Array.isArray(references) || references.length === 0)) {
    return false;
  }

  let hydrated = false;

  while (true) {
    const placeholder = marker.querySelector("template[data-mreact-client-boundary]");

    if (placeholder === null) {
      return hydrated;
    }

    const name = placeholder.getAttribute("data-mreact-client-boundary");
    const entry = name === null ? undefined : components.get(name);
    const component = typeof entry === "function" ? entry : entry?.component;
    const compat = entry?.compat === true;

    if (typeof component !== "function") {
      return false;
    }

    const propsElement = __mreactClientBoundaryPropsElement(placeholder, name);
    let props = propsElement?.textContent ? JSON.parse(propsElement.textContent) : {};
    const fallbackChildren = __mreactClientBoundaryFallbackChildren(placeholder, propsElement);

    if (fallbackChildren !== undefined) {
      props.children = fallbackChildren;
    }

    if (compat) {
      const parentContainer = __mreactClientBoundaryParentContainer(placeholder, propsElement);
      const container = parentContainer ?? document.createElement("span");
      container.setAttribute("data-mreact-compat-boundary", name ?? "");
      if (parentContainer === null) {
        container.style.display = "contents";
        placeholder.replaceWith(container);
      } else {
        placeholder.remove();
      }
      propsElement?.remove();
      const root = __mreactCompatCreateRoot(container);
      container.__mreactCompatRoot = root;
      root.render(__mreactCompatCreateElement(component, props));
      hydrated = true;
      continue;
    }

    props = component(props);
    placeholder.replaceWith(...(props == null || typeof props === "boolean" ? [] : [props]));
    propsElement?.remove();
    hydrated = true;
  }
}

function __mreactClientBoundaryParentContainer(placeholder, propsElement) {
  const parent = placeholder.parentElement;

  if (parent === null) {
    return null;
  }

  for (const node of Array.from(parent.childNodes)) {
    if (node === placeholder || node === propsElement) {
      continue;
    }

    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() === "") {
      continue;
    }

    return null;
  }

  return parent;
}

function __mreactHasNonSerializableClientBoundaries(marker) {
  return marker.querySelector(
    'template[data-mreact-client-boundary][data-mreact-client-boundary-nonserializable="true"]',
  ) !== null;
}

function __mreactClientBoundaryPropsElement(placeholder, name) {
  let next = placeholder.nextSibling;

  while (next !== null) {
    if (
      next.nodeType === Node.ELEMENT_NODE &&
      next.tagName === "SCRIPT" &&
      next.getAttribute("type") === "application/json" &&
      next.getAttribute("data-mreact-client-boundary-props") === name
    ) {
      return next;
    }

    next = next.nextSibling;
  }

  return undefined;
}

function __mreactClientBoundaryFallbackChildren(placeholder, propsElement) {
  const componentFallback =
    placeholder.getAttribute("data-mreact-client-boundary-fallback") === "component";
  const nodes = [];
  let next = placeholder.nextSibling;

  while (next !== null && next !== propsElement) {
    const current = next;
    next = next.nextSibling;

    if (current.nodeType === Node.TEXT_NODE && (current.textContent ?? "").trim() === "") {
      current.remove();
      continue;
    }

    current.remove();
    nodes.push(current);
  }

  if (componentFallback) {
    return __mreactExtractClientBoundaryChildren(
      nodes,
      placeholder.getAttribute("data-mreact-client-boundary"),
    );
  }

  if (nodes.length === 0) {
    return undefined;
  }

  return nodes.length === 1 ? nodes[0] : nodes;
}

function __mreactExtractClientBoundaryChildren(nodes, name) {
  const startMarker = "mreact-client-boundary-children-start";
  const endMarker = "mreact-client-boundary-children-end";
  const archive = nodes.find(
    (node) =>
      node.nodeType === Node.ELEMENT_NODE &&
      node.tagName === "TEMPLATE" &&
      node.getAttribute("data-mreact-client-boundary-children") === name,
  );

  const roots = archive === undefined ? nodes : Array.from(archive.content.childNodes);
  const markers = [];
  const visit = (node) => {
    if (
      node.nodeType === Node.COMMENT_NODE &&
      (node.nodeValue === startMarker || node.nodeValue === endMarker)
    ) {
      markers.push(node);
    }

    for (const child of Array.from(node.childNodes ?? [])) {
      visit(child);
    }
  };

  for (const root of roots) {
    visit(root);
  }

  let start;
  let depth = 0;

  for (const marker of markers) {
    if (marker.nodeValue === startMarker) {
      if (depth === 0) {
        start = marker;
      }
      depth += 1;
      continue;
    }

    if (depth === 0 || start === undefined) {
      continue;
    }

    depth -= 1;

    if (depth !== 0) {
      continue;
    }

    if (start.parentNode !== marker.parentNode) {
      start = undefined;
      continue;
    }

    const children = [];
    let current = start.nextSibling;

    while (current !== null && current !== marker) {
      const next = current.nextSibling;
      current.remove();
      children.push(current);
      current = next;
    }

    start.remove();
    marker.remove();
    return children.length === 0 ? "" : children.length === 1 ? children[0] : children;
  }

  return undefined;
}
`,
  fragments: `function __mreactApplyOutOfOrderFragments(root) {
  const fragments = Array.from(root.querySelectorAll("template[data-mreact-oob-fragment]"));
  const completionMarkers = new Map();
  for (const marker of root.querySelectorAll("[data-mreact-oob-complete]")) {
    const id = marker.getAttribute("data-mreact-oob-complete");
    if (!completionMarkers.has(id)) {
      completionMarkers.set(id, marker);
    }
  }
  const placeholders = new Map();
  for (const placeholder of root.querySelectorAll("[data-mreact-oob-placeholder]")) {
    const id = placeholder.getAttribute("data-mreact-oob-placeholder");
    if (!placeholders.has(id)) {
      placeholders.set(id, placeholder);
    }
  }

  for (const fragment of fragments) {
    const id = fragment.getAttribute("data-mreact-oob-fragment");

    if (id === null) {
      continue;
    }

    const completionMarker = completionMarkers.get(id);
    if (completionMarker === undefined) {
      continue;
    }

    const placeholder = placeholders.get(id);
    if (placeholder === undefined) {
      continue;
    }

    placeholder.replaceWith(fragment.content.cloneNode(true));
    fragment.remove();
    completionMarker.remove();
  }
}
`,
  lifecycle: `function __mreactRunLifecycleTasks(values, run) {
  let firstError;

  for (const value of values) {
    try {
      run(value);
    } catch (error) {
      firstError ??= error;
    }
  }

  if (firstError !== undefined) {
    queueMicrotask(() => {
      throw firstError;
    });
  }
}
`,
  resume: `function __mreactUnmountCompatBoundaries(root) {
  const containers = [];

  if (
    root.nodeType === Node.ELEMENT_NODE &&
    root.hasAttribute("data-mreact-compat-boundary")
  ) {
    containers.push(root);
  }

  if (typeof root.querySelectorAll === "function") {
    containers.push(...root.querySelectorAll("[data-mreact-compat-boundary]"));
  }

  for (const container of containers) {
    const compatRoot = container.__mreactCompatRoot;

    if (compatRoot === undefined || typeof compatRoot.unmount !== "function") {
      continue;
    }

    compatRoot.unmount();
    container.__mreactCompatRoot = undefined;
  }
}

function __mreactResumeRoute(marker, nextNode) {
  if (nextNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    marker.replaceChildren(nextNode);
    return;
  }

  const current = __mreactRouteResumeTarget(marker, nextNode);

  if (current === null) {
    marker.appendChild(nextNode);
    return;
  }

  __mreactResumeNode(current, nextNode);

  const active = current.parentNode === marker
    ? current
    : nextNode.parentNode === marker
      ? nextNode
      : null;

  if (active === null) {
    return;
  }

  for (const child of Array.from(marker.childNodes)) {
    if (child === active) {
      continue;
    }

    __mreactUnmountCompatBoundaries(child);
    child.remove();
  }
}

function __mreactRouteResumeTarget(marker, nextNode) {
  const current = marker.firstChild;

  if (
    current === null ||
    current.nodeType !== Node.ELEMENT_NODE ||
    nextNode.nodeType !== Node.ELEMENT_NODE ||
    current.tagName === nextNode.tagName ||
    !current.hasAttribute("data-mreact-layout-boundary")
  ) {
    return current;
  }

  return __mreactFindLayoutPageTarget(current, nextNode) ?? current;
}

function __mreactFindLayoutPageTarget(current, nextNode) {
  for (const child of Array.from(current.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    if (
      child.tagName === nextNode.tagName &&
      !child.hasAttribute("data-mreact-layout-boundary") &&
      !child.hasAttribute("data-mreact-template-boundary")
    ) {
      return child;
    }

    if (child.hasAttribute("data-mreact-layout-boundary")) {
      const nested = __mreactFindLayoutPageTarget(child, nextNode);

      if (nested !== null) {
        return nested;
      }
    }
  }

  return null;
}

function __mreactResumeNode(current, next) {
  if (
    next.nodeType === Node.COMMENT_NODE &&
    next.nodeValue === "mreact-async-boundary"
  ) {
    // Server stream emits the resolved <Await> content; preserve the existing
    // DOM instead of replacing it with the client placeholder comment.
    return;
  }

  if (__mreactShouldReplaceNode(current, next)) {
    __mreactUnmountCompatBoundaries(current);
    current.replaceWith(next);
    return;
  }

  if (current.nodeType === Node.TEXT_NODE && next.nodeType === Node.TEXT_NODE) {
    if (current.nodeValue !== next.nodeValue) {
      current.nodeValue = next.nodeValue;
    }
    return;
  }

  if (current.nodeType !== Node.ELEMENT_NODE || next.nodeType !== Node.ELEMENT_NODE) {
    __mreactUnmountCompatBoundaries(current);
    current.replaceWith(next);
    return;
  }

  __mreactSyncEventBindings(current, next);
  __mreactSyncDomRefBindings(current, next);
  __mreactSyncAttributes(current, next);
  __mreactResumeChildren(current, next);
  __mreactSyncPropBindings(current, next);
}

function __mreactShouldReplaceNode(current, next) {
  if (
    next.nodeType === Node.ELEMENT_NODE &&
    next.hasAttribute("data-mreact-template-boundary")
  ) {
    return true;
  }

  if (current.nodeType !== next.nodeType) {
    return true;
  }

  return current.nodeType === Node.ELEMENT_NODE &&
    current.tagName !== next.tagName;
}

function __mreactSyncAttributes(current, next) {
  for (const attribute of Array.from(current.attributes)) {
    if (!next.hasAttribute(attribute.name)) {
      current.removeAttribute(attribute.name);
    }
  }

  for (const attribute of Array.from(next.attributes)) {
    if (current.getAttribute(attribute.name) !== attribute.value) {
      current.setAttribute(attribute.name, attribute.value);
    }
  }
}

function __mreactSyncPropBindings(current, next) {
  const previousBindings = current.__mreactPropBindings;

  if (Array.isArray(previousBindings)) {
    __mreactRunLifecycleTasks(previousBindings, (binding) => binding.dispose?.());
  }

  const bindings = next.__mreactPropBindings;

  if (!Array.isArray(bindings) || bindings.length === 0) {
    current.__mreactPropBindings = [];
    current.__mreactHasReactiveProps = false;
    return;
  }

  current.__mreactPropBindings = bindings;
  current.__mreactHasReactiveProps = true;
  next.__mreactPropBindings = [];
  next.__mreactHasReactiveProps = false;

  __mreactRunLifecycleTasks(bindings, (binding) => binding.retarget?.(current));
}

function __mreactResumeChildren(current, next) {
  const nextChildren = Array.from(next.childNodes);
  const refreshTextBindings = next.__mreactHasEvents === true;
  let index = 0;

  while (index < nextChildren.length) {
    const currentChild = current.childNodes[index];
    const nextChild = nextChildren[index];

    if (currentChild === undefined) {
      current.appendChild(nextChild);
      index += 1;
      continue;
    }

    // Nodes owned by insertDynamic/bindText must replace the matching server
    // DOM so subsequent reactive updates mutate the live node/range instead of
    // appending beside stale SSR fallback content.
    const isDynamicNode = nextChild.__mreactDynamicNode === true;
    const isReactiveText = nextChild.__mreactReactiveText === true;

    if (isDynamicNode) {
      currentChild.replaceWith(nextChild);
    } else if (
      (refreshTextBindings || isReactiveText) &&
      currentChild.nodeType === Node.TEXT_NODE &&
      nextChild.nodeType === Node.TEXT_NODE
    ) {
      currentChild.replaceWith(nextChild);
    } else {
      __mreactResumeNode(currentChild, nextChild);
    }
    index += 1;
  }

  while (current.childNodes.length > nextChildren.length) {
    const lastChild = current.lastChild;
    if (lastChild === null) {
      break;
    }
    __mreactUnmountCompatBoundaries(lastChild);
    lastChild.remove();
  }
}
`,
};
