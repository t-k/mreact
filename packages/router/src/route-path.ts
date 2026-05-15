export function normalizeRoutePath(pathname: string): string {
  const withoutTrailing = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  return withoutTrailing === "" ? "/" : withoutTrailing;
}
