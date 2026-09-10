/** Detach route metadata before DOM reconciliation can consume its child nodes. */
export function takeNavigationRouteDataScripts(
  root: DocumentFragment,
  ids: Iterable<string>,
): Map<string, HTMLElement | null> {
  const scripts = new Map<string, HTMLElement | null>();
  for (const id of ids) {
    const next = root.getElementById(id);
    next?.remove();
    scripts.set(id, next);
  }
  return scripts;
}
