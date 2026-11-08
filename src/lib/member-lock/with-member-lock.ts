import type { Prisma, PrismaClient } from "@/generated/prisma/client";

// F8.2.4a (docs/w1-implementation-plan.md, clarification A). Serialises writes that touch one (userId, organizationId)
// Member pair, because `member` has no unique index on the pair yet. Nothing in the app calls this in W1; wrapping the
// existing Member writes is F8.2.4b.
//
// The lock and the protected writes share ONE interactive transaction. `fn` receives only that transaction's client, so a
// write made through it is made on the lock's connection. A write made through the global client would run on another
// connection and escape the lock; keep `fn` to the `tx` it is given.
//
// pg_advisory_xact_lock is released by PostgreSQL on commit, rollback or connection loss, so nothing here needs a `finally`.
//
// Timeout semantics: `timeoutMs` is ONE budget for the whole call, measured on the monotonic clock from the moment
// withMemberLock is called. It covers waiting for a pooled connection, waiting for the lock, and starting `fn`.
// - `fn` is invoked only if that deadline has not passed, checked synchronously immediately before `fn(tx)`. Otherwise the call
//   rejects with MemberLockTimeoutError and `fn` is not called.
// - The wait for the lock is cut off at the deadline: before taking the lock the helper sets a transaction-local `lock_timeout`
//   to the time that is left, so a caller queued behind a slow holder gives up on time instead of waiting for the holder.
//   `lock_timeout` is put back to its previous value as soon as the lock is held, so it does not bound the waits inside `fn`.
// - How that fits Prisma's own timer: Prisma arms its transaction timer (`timeout`, passed unchanged) only after the connection is
//   acquired and BEGIN has run, which is after this deadline's start. So an `fn` that is invoked starts before Prisma expires the
//   transaction. Prisma's timer, not this deadline, still bounds how long a running `fn` may take: an `fn` that outlives
//   `timeoutMs` has its next query fail with Prisma P2028 and the transaction is rolled back. Caveat: Node timers can fire up to
//   about 1 ms early on some platforms.
// - `maxWaitMs` (the longest wait for a free pooled connection) is separate and still surfaces as Prisma P2028.
//
// Limitations (documented, not enforced here):
// - Every caller holds ONE pooled connection for its whole transaction, including while it waits for the lock. N callers
//   queued on one pair hold N connections. If N reaches the pool size, other work (and a lock holder that reaches for a second
//   connection through the root client) waits for a free connection and fails with Prisma P2028 after `maxWaitMs`. The helper
//   sets no concurrency limit and does not change pool configuration; size the pool for the callers you expect.
// - The helper cannot stop `fn` from using the root Prisma client; such a write runs on another connection, outside the lock.
// - The lock key is the 64-bit hashtextextended of "member:<userId>:<organizationId>". Two different pairs that hash alike
//   (or ids containing ':') share a lock: that only adds waiting, never loses exclusion.
// - The lock-wait bound recognises PostgreSQL SQLSTATE 55P03 only in the shape Prisma 7.10.1 with @prisma/adapter-pg reports:
//   a P2010 error whose `meta.driverAdapterError.cause.code` is "55P03". Any other shape (another adapter, the classic engine)
//   is NOT converted and surfaces as the original error. Only the lock statement is inspected.
// - `timeoutMs` and `maxWaitMs` are caller options and are validated before any SQL: each must be a positive number of at most
//   2147483647 ms (about 24.8 days), otherwise RangeError. That is PostgreSQL's lock_timeout limit and Node's setTimeout limit
//   (Prisma arms both of its timers with setTimeout; larger values would fire at once, and 0 is rejected by Prisma as missing).

export type MemberLockTx = Prisma.TransactionClient;

export type MemberLockOptions = {
  /** The longest wait for a free pooled connection, in ms (default 5000). A positive number of at most 2147483647; anything else is a RangeError. */
  maxWaitMs?: number;
  /** The whole call's budget in ms, from the call (connection wait, lock wait, starting `fn`); also Prisma's transaction timeout. At most 2147483647. */
  timeoutMs?: number;
};

/** The caller's time budget ran out before `fn` could start (waiting for a connection or for the lock). `fn` was not called. */
export class MemberLockTimeoutError extends Error {
  constructor(
    readonly timeoutMs: number,
    readonly waitedMs: number,
  ) {
    super(`Timed out waiting for the member lock (waited ${waitedMs} ms of a ${timeoutMs} ms budget)`);
    this.name = "MemberLockTimeoutError";
  }
}

const DEFAULT_MAX_WAIT_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const LOCK_NOT_AVAILABLE = "55P03"; // lock_timeout expired
/** Largest value PostgreSQL accepts for lock_timeout (INT_MAX ms); Node's setTimeout shares the limit. */
export const MAX_TIMEOUT_MS = 2_147_483_647;

/** The text hashed into the advisory-lock key. Exported so tests can inspect `pg_locks` for the same pair. */
export function memberLockKey(userId: string, organizationId: string): string {
  return `member:${userId}:${organizationId}`;
}

/** Takes the same per-pair lock as `withMemberLock`, inside a transaction the caller already has (it is released at its commit or rollback). */
export async function lockMemberPair(tx: Pick<Prisma.TransactionClient, "$executeRaw">, userId: string, organizationId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${memberLockKey(userId, organizationId)}, 0))`;
}

function isLockTimeout(e: unknown): boolean {
  const cause = (e as { meta?: { driverAdapterError?: { cause?: { code?: string } } } } | null)?.meta?.driverAdapterError?.cause;
  return cause?.code === LOCK_NOT_AVAILABLE;
}

export async function withMemberLock<T>(
  db: Pick<PrismaClient, "$transaction">,
  userId: string,
  organizationId: string,
  fn: (tx: MemberLockTx) => Promise<T>,
  options: MemberLockOptions = {},
): Promise<T> {
  if (!userId || !organizationId) throw new Error("withMemberLock needs a userId and an organizationId");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  for (const [name, value] of [["timeoutMs", timeoutMs], ["maxWaitMs", maxWaitMs]] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`withMemberLock ${name} must be a positive number of milliseconds`);
    if (value > MAX_TIMEOUT_MS) throw new RangeError(`withMemberLock ${name} must be at most ${MAX_TIMEOUT_MS} ms (PostgreSQL lock_timeout and Node timer limit)`);
  }
  const key = memberLockKey(userId, organizationId);
  const startedAt = performance.now(); // monotonic; read before the transaction is opened, so Prisma's timer is armed after it
  const deadline = startedAt + timeoutMs;
  const expired = () => new MemberLockTimeoutError(timeoutMs, Math.round(performance.now() - startedAt));
  // Give up on the lock a little before the deadline so the clear MemberLockTimeoutError wins over any later timer.
  const headroomMs = Math.min(50, Math.floor(timeoutMs / 10));
  return db.$transaction(
    async (tx) => {
      if (performance.now() >= deadline) throw expired(); // the budget went on waiting for a connection; no SQL is issued
      const previous = (await tx.$queryRaw<{ v: string }[]>`SELECT current_setting('lock_timeout') AS v`)[0].v;
      const remainingMs = deadline - performance.now() - headroomMs;
      if (remainingMs < 1) throw expired();
      // set_config(..., true) is SET LOCAL (ends with the transaction) but, unlike SET, accepts a bound parameter.
      await tx.$queryRaw`SELECT set_config('lock_timeout', ${String(Math.floor(remainingMs))}, true)`;
      try {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      } catch (e) {
        if (isLockTimeout(e)) throw expired();
        throw e;
      }
      // fn must not inherit the short lock wait: put the previous setting back now that the lock is held.
      await tx.$queryRaw`SELECT set_config('lock_timeout', ${previous}, true)`;
      if (performance.now() >= deadline) throw expired(); // checked synchronously before fn: fn is never invoked past the deadline
      return fn(tx);
    },
    { maxWait: maxWaitMs, timeout: timeoutMs },
  );
}
