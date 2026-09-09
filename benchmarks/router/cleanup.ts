export interface CleanupTask {
  name: string;
  run(): void | Promise<void>;
}

/** Attempt every cleanup in order, retaining failures until all tasks have settled. */
export async function runCleanupTasks(tasks: readonly CleanupTask[]): Promise<void> {
  const errors: Error[] = [];
  for (const task of tasks) {
    try {
      await task.run();
    } catch (cause) {
      errors.push(
        new Error(`${task.name}: ${cause instanceof Error ? cause.message : String(cause)}`, {
          cause,
        }),
      );
    }
  }
  if (errors.length !== 0) {
    throw new AggregateError(errors, errors.map((error) => error.message).join("; "));
  }
}
