/**
 * How long a team invitation link stays valid (AJ, 2026-09-30: 48 hours).
 * One constant so the Better Auth config (auth.ts) and every line of UI copy
 * that mentions it can never drift apart. No `server-only`: the invite form
 * reads it too.
 */
export const INVITATION_EXPIRY_HOURS = 48;
export const INVITATION_EXPIRES_IN_SECONDS = INVITATION_EXPIRY_HOURS * 60 * 60;
