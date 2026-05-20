// Loader-side data module imported by app/users/$id/page.tsx. The
// loader is bundled before the page renders, so this helper behaves like
// a normal ESM import.

const USERS = new Map([
  ["ada", { name: "Ada Lovelace", role: "engineer" }],
  ["grace", { name: "Grace Hopper", role: "naval officer" }],
  ["margaret", { name: "Margaret Hamilton", role: "software lead" }],
]);

export function lookupUser(
  id: string,
): { name: string; role: string } | undefined {
  return USERS.get(id);
}

// generateStaticParams calls this at build time to enumerate the
// prerender keys.
export function listUserIds(): string[] {
  return [...USERS.keys()];
}
