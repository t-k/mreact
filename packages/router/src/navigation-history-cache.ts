/** Retains recent outgoing history snapshots without growing with the entire session. */
export function rememberNavigationHistorySnapshot<T>(
  snapshots: Map<string, T>,
  entryId: string,
  snapshot: T,
): void {
  snapshots.delete(entryId);
  snapshots.set(entryId, snapshot);
  while (snapshots.size > 32) {
    snapshots.delete(snapshots.keys().next().value!);
  }
}
