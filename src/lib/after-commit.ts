/** Work that must only happen once a transaction has committed (customer notifications, putting stock back). */
export type AfterCommit = (() => Promise<unknown>)[];

/** Runs what a committed transaction queued. A failure here is logged, never reported as a failure of the change that already committed. */
export async function runAfterCommit(queue: AfterCommit) {
  for (const effect of queue) {
    try {
      await effect();
    } catch (error) {
      console.error("[after-commit] effect failed", error);
    }
  }
}
