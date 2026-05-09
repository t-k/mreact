export interface Scheduler {
  schedule(flush: () => void): void;
}

export function setScheduler(_scheduler: Scheduler): () => void {
  throw new Error("setScheduler is not implemented yet");
}
