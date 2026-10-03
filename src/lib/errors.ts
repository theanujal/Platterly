/**
 * Chunk 17.3 — what a person is allowed to read when something goes wrong.
 *
 * Our own errors (a validation message, "That is more than the balance...") are written for people and are shown
 * as they are. Anything internal (a database error that names a table and a file path, a crash, a network failure)
 * is logged on the server and replaced by a plain sentence, so no internals leak to the browser.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const INTERNAL_MARKERS = [/PrismaClient/i, /Invalid `prisma\./, /\bprisma\.\w+\.\w+\(/, /node_modules/, /\/src\//, /\\src\\/, /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/, /\bat \S+ \(.*:\d+:\d+\)/, /\.(ts|tsx|js|mjs):\d+/];

export function isInternalError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  if (error.name.startsWith("PrismaClient")) return true;
  return INTERNAL_MARKERS.some((marker) => marker.test(error.message));
}

/** The message to show a person for a failed action. */
export function userMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (isInternalError(error)) {
    console.error("[action error]", error);
    return fallback;
  }
  const message = (error as Error).message?.trim();
  return message ? message : fallback;
}
