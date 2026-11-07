import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { deviceLabel } from "./devices";

// Sign-in history: successful sign-ins and refused (wrong password) attempts, per person, kept 90 days. Every query is scoped to the caller's own
// provider user id. Nothing about the address a person came from is stored or shown.
export const HISTORY_DAYS = 90;
export const HISTORY_LIMIT = 50;
export type HistoryOutcome = "signed_in" | "wrong_password";
export type HistoryEntry = { id: string; outcome: HistoryOutcome; device: string; at: string };

/** Writes one event and drops that person's events older than 90 days. Never throws: history must not break signing in. */
export async function recordSignIn(pool: Pool, event: { userId: string; outcome: HistoryOutcome; userAgent?: string | null }, now: Date = new Date()): Promise<void> {
  try {
    await pool.query('insert into "signInEvent" ("id", "userId", "outcome", "userAgent", "createdAt") values ($1, $2, $3, $4, $5)', [randomUUID(), event.userId, event.outcome, (event.userAgent ?? "").slice(0, 300) || null, now]);
    await pool.query('delete from "signInEvent" where "userId" = $1 and "createdAt" < $2', [event.userId, new Date(now.getTime() - HISTORY_DAYS * 86_400_000)]);
  } catch (error) {
    console.error("sign-in history write failed", error instanceof Error ? error.message : "unknown");
  }
}

export async function listSignInHistory(pool: Pool, userId: string, now: Date = new Date()): Promise<HistoryEntry[]> {
  const { rows } = await pool.query(
    'select "id", "outcome", "userAgent", "createdAt" from "signInEvent" where "userId" = $1 and "createdAt" >= $2 order by "createdAt" desc limit $3',
    [userId, new Date(now.getTime() - HISTORY_DAYS * 86_400_000), HISTORY_LIMIT],
  );
  return rows.map((r) => ({ id: r.id as string, outcome: r.outcome as HistoryOutcome, device: deviceLabel(r.userAgent as string | null), at: (r.createdAt as Date).toISOString() }));
}
