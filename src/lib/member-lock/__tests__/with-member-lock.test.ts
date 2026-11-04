import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { Client, Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { MAX_TIMEOUT_MS, MemberLockTimeoutError, type MemberLockTx, memberLockKey, withMemberLock } from "../with-member-lock";
import { SERVER_FACTS_SQL, assertApprovedTarget, checkServerFacts, type ServerFacts } from "./scratch-target";

// F8.2.4a concurrency tests (docs/w1-implementation-plan.md, clarification A).
// They run ONLY against the approved scratch database and only when MEMBER_LOCK_TEST_DATABASE_URL is set; otherwise the
// whole file skips, so the default `npm run test` (which uses platterly_dev) never executes it. DATABASE_URL and .env are
// never read for the connection. The target guard is scratch-target.ts (exact approved URLs, no query parameters, no libpq
// environment variables, then live server checks after connecting). Run with:
//   MEMBER_LOCK_TEST_DATABASE_URL='postgresql://platterly_app@localhost:5432/platterly_member_lock_test' npx vitest run src/lib/member-lock
const URL_ENV = process.env.MEMBER_LOCK_TEST_DATABASE_URL;
const PREFIX = "lock-test-";
const WORKERS = 8;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolves every waiter once `n` have arrived. */
function barrier(n: number) {
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  return async () => {
    if (++arrived >= n) release();
    await gate;
  };
}

describe.skipIf(!URL_ENV)("withMemberLock (scratch database)", () => {
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

  let prismaPool: Pool;
  let prisma: PrismaClient;
  let observer: Client;
  let seq = 0;

  // Everything a test leaves open is registered here so cleanup() can finish it even when the test body threw midway.
  const openers: Array<() => void> = [];
  const pending: Array<Promise<unknown>> = [];
  const extraCleanups: Array<() => Promise<void>> = [];

  /** A gate a callback can wait on. Cleanup opens every gate, so no transaction is left holding a lock. */
  function gate() {
    let open!: () => void;
    const wait = new Promise<void>((r) => (open = r));
    openers.push(open);
    return { wait, open };
  }
  function entered() {
    let signal!: () => void;
    const reached = new Promise<void>((r) => (signal = r));
    return { signal, reached };
  }
  /** Registers a promise so cleanup waits for it to settle; returns it unchanged. */
  function track<T>(p: Promise<T>): Promise<T> {
    pending.push(p.catch(() => undefined));
    return p;
  }

  async function pair() {
    const n = `${Date.now()}-${++seq}`;
    const user = await prisma.user.create({ data: { id: `${PREFIX}u-${n}`, name: "Lock Test", email: `${PREFIX}${n}@example.invalid` } });
    const org = await prisma.organization.create({ data: { id: `${PREFIX}o-${n}`, name: "Lock Test Org", slug: `${PREFIX}${n}`, createdAt: new Date() } });
    return { userId: user.id, organizationId: org.id };
  }
  const memberRow = (organizationId: string, userId: string, tag: string) => ({
    id: `${PREFIX}m-${tag}-${Date.now()}-${++seq}`,
    organizationId,
    userId,
    role: "member",
    createdAt: new Date(),
  });

  const memberCount = async (userId: string, organizationId: string) =>
    (await observer.query(`SELECT count(*)::int AS n FROM member WHERE "userId"=$1 AND "organizationId"=$2`, [userId, organizationId])).rows[0].n as number;

  const lockHash = "hashtextextended($1, 0)";
  const lockMatch = `locktype='advisory' AND ((classid::bigint << 32) | objid::bigint) = ${lockHash}`;
  const waitingFor = async (key: string) =>
    (await observer.query(`SELECT count(*)::int AS n FROM pg_locks WHERE ${lockMatch} AND NOT granted`, [key])).rows[0].n as number;
  const lockPids = async (key: string) =>
    (await observer.query(`SELECT DISTINCT pid, granted FROM pg_locks WHERE ${lockMatch} ORDER BY granted DESC`, [key])).rows as { pid: number; granted: boolean }[];

  async function waitUntil(check: () => Promise<boolean>, what: string, ms = 5_000) {
    for (let waited = 0; waited < ms; waited += 25) {
      if (await check()) return;
      await sleep(25);
    }
    throw new Error(`timed out waiting for ${what}`);
  }

  async function fixtureRows() {
    const q = async (sql: string) => (await observer.query(sql, [`${PREFIX}%`])).rows[0].n as number;
    return {
      users: await q(`SELECT count(*)::int AS n FROM "user" WHERE id LIKE $1`),
      organizations: await q(`SELECT count(*)::int AS n FROM organization WHERE id LIKE $1`),
      members: await q(`SELECT count(*)::int AS n FROM member WHERE "userId" LIKE $1 OR id LIKE $1`),
    };
  }

  /**
   * Finishes anything a test left open, then deletes only this file's lock-test- rows. Runs after every test, including a
   * test that threw midway. It fails loudly (lock_timeout on the observer) instead of hanging, and then confirms nothing is left.
   */
  async function cleanup() {
    const errors: unknown[] = [];
    try {
      for (const open of openers.splice(0)) open();
      const settled = Promise.allSettled(pending.splice(0));
      await Promise.race([settled, sleep(15_000).then(() => { throw new Error("transactions left open by a test did not finish"); })]);
      for (const c of extraCleanups.splice(0)) await c();
    } catch (e) {
      errors.push(e);
    }
    try {
      await observer.query(`DELETE FROM member WHERE "userId" LIKE $1 OR id LIKE $1`, [`${PREFIX}%`]);
      await observer.query(`DELETE FROM "user" WHERE id LIKE $1`, [`${PREFIX}%`]);
      await observer.query(`DELETE FROM organization WHERE id LIKE $1`, [`${PREFIX}%`]);
      const left = await fixtureRows();
      if (left.users || left.organizations || left.members) errors.push(new Error(`fixture rows remain after cleanup: ${JSON.stringify(left)}`));
    } catch (e) {
      errors.push(e);
    }
    if (errors.length) throw new AggregateError(errors, "member-lock test cleanup failed");
  }

  beforeAll(async () => {
    assertApprovedTarget(URL_ENV!);
    observer = new Client({ connectionString: URL_ENV });
    await observer.connect();
    checkServerFacts((await observer.query(SERVER_FACTS_SQL)).rows[0] as ServerFacts);
    for (const t of ['"user"', "organization", "member"]) {
      const n = (await observer.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
      if (n !== 0) throw new Error(`${t} is not empty on the scratch database (${n} rows); refusing to run`);
    }
    await observer.query("SET lock_timeout = '5s'"); // cleanup DELETEs fail loudly rather than hang on a stuck transaction
    // Room for the 8 workers' open transactions plus fixtures; each interactive transaction holds one connection.
    prismaPool = new Pool({ connectionString: URL_ENV, max: WORKERS + 4 });
    prismaPool.on("error", () => undefined); // a terminated idle connection must not crash the run
    prisma = new PrismaClient({ adapter: new PrismaPg(prismaPool) });
  });

  afterEach(cleanup);

  afterAll(async () => {
    try {
      if (observer) await cleanup();
    } finally {
      await prisma?.$disconnect();
      await prismaPool?.end();
      await observer?.end();
    }
  });

  it("control: a naive check-then-insert from 8 separate connections creates duplicates (the race is real)", async () => {
    const { userId, organizationId } = await pair();
    const checked = barrier(WORKERS);
    const pids = new Set<number>();
    await Promise.all(
      Array.from({ length: WORKERS }, async (_, i) => {
        const c = new Client({ connectionString: URL_ENV });
        await c.connect();
        try {
          pids.add((await c.query("SELECT pg_backend_pid() AS p")).rows[0].p);
          await c.query("BEGIN");
          const { n } = (await c.query(`SELECT count(*)::int AS n FROM member WHERE "userId"=$1 AND "organizationId"=$2`, [userId, organizationId])).rows[0];
          await checked(); // every worker has seen the pair absent before any inserts
          if (n === 0) await c.query(`INSERT INTO member (id, "organizationId", "userId", role, "createdAt") VALUES ($1,$2,$3,'member',now())`, [memberRow(organizationId, userId, `c${i}`).id, organizationId, userId]);
          await c.query("COMMIT");
        } finally {
          await c.end();
        }
      }),
    );
    expect(pids.size).toBe(WORKERS);
    expect(await memberCount(userId, organizationId)).toBeGreaterThan(1);
  });

  it("helper: 8 workers overlap on one pair (1 holds, 7 wait on 8 distinct backends) and still leave exactly one row", async () => {
    const { userId, organizationId } = await pair();
    const key = memberLockKey(userId, organizationId);
    const start = barrier(WORKERS);
    const hold = gate();
    let active = 0;
    let maxActive = 0;
    let first = true;

    const workers = Array.from({ length: WORKERS }, (_, i) =>
      track(
        (async () => {
          await start();
          await withMemberLock(prisma, userId, organizationId, async (tx) => {
            active++;
            maxActive = Math.max(maxActive, active);
            try {
              if (first) {
                first = false;
                await hold.wait; // the first caller keeps the lock until the others are seen waiting
              }
              const n = await tx.member.count({ where: { userId, organizationId } });
              await sleep(20); // widen the check-then-write window; the lock must still hold
              if (n === 0) await tx.member.create({ data: memberRow(organizationId, userId, `h${i}`) });
            } finally {
              active--;
            }
          });
        })(),
      ),
    );

    await waitUntil(async () => (await waitingFor(key)) === WORKERS - 1, `${WORKERS - 1} callers waiting on the lock`);
    const holders = await lockPids(key);
    expect(holders.filter((h) => h.granted)).toHaveLength(1);
    expect(holders.filter((h) => !h.granted)).toHaveLength(WORKERS - 1);
    expect(new Set(holders.map((h) => h.pid)).size).toBe(WORKERS); // 8 distinct backends, all present on the lock at the same moment
    hold.open();
    await Promise.all(workers);

    expect(maxActive).toBe(1); // never two callbacks inside the lock at once
    expect(await memberCount(userId, organizationId)).toBe(1);
  });

  it("the lock and the callback's transaction share one connection", async () => {
    const { userId, organizationId } = await pair();
    await withMemberLock(prisma, userId, organizationId, async (tx) => {
      const txPid = (await tx.$queryRaw<{ p: number }[]>`SELECT pg_backend_pid() AS p`)[0].p;
      const holders = await lockPids(memberLockKey(userId, organizationId));
      expect(holders.map((h) => h.pid)).toEqual([txPid]);
    });
  });

  it("blocking: a second caller for the same pair waits in pg_locks and proceeds only after the first commits", async () => {
    const { userId, organizationId } = await pair();
    const key = memberLockKey(userId, organizationId);
    const hold = gate();
    const inside = entered();
    let secondRan = false;

    const first = track(withMemberLock(prisma, userId, organizationId, async () => {
      inside.signal();
      await hold.wait;
    }));
    await inside.reached;
    const second = track(withMemberLock(prisma, userId, organizationId, async () => {
      secondRan = true;
    }));
    await waitUntil(async () => (await waitingFor(key)) === 1, "the second caller to wait on the lock");
    expect(secondRan).toBe(false);
    hold.open();
    await Promise.all([first, second]);
    expect(secondRan).toBe(true);
  });

  it("release on rollback: when the first caller throws, the waiting caller proceeds and the first one's write is gone", async () => {
    const { userId, organizationId } = await pair();
    const key = memberLockKey(userId, organizationId);
    const fail = gate();
    const inside = entered();
    let secondRan = false;

    const first = track(withMemberLock(prisma, userId, organizationId, async (tx) => {
      await tx.member.create({ data: memberRow(organizationId, userId, "rollback") });
      inside.signal();
      await fail.wait;
      throw new Error("boom");
    }));
    const firstResult = first.then(() => "ok", (e: Error) => e.message);
    await inside.reached;
    const second = track(withMemberLock(prisma, userId, organizationId, async () => {
      secondRan = true;
    }));
    await waitUntil(async () => (await waitingFor(key)) === 1, "the second caller to wait on the lock");
    fail.open();
    expect(await firstResult).toBe("boom");
    await second;
    expect(secondRan).toBe(true);
    expect(await memberCount(userId, organizationId)).toBe(0);
  });

  it("independence: a different pair is not blocked while another pair's lock is held", async () => {
    const a = await pair();
    const b = await pair();
    const hold = gate();
    const inside = entered();
    const first = track(withMemberLock(prisma, a.userId, a.organizationId, async () => {
      inside.signal();
      await hold.wait;
    }));
    await inside.reached;
    let bRan = false;
    await withMemberLock(prisma, b.userId, b.organizationId, async () => {
      bRan = true;
    });
    expect(bRan).toBe(true); // finished while A's lock was still held
    hold.open();
    await first;
  });

  it("refuses an empty user or organisation id", async () => {
    await expect(withMemberLock(prisma, "", "x", async () => 1)).rejects.toThrow(/needs a userId/);
  });

  describe("timeouts", () => {
    it("transaction timeout: a callback that outlives timeoutMs fails, its write is rolled back and the lock is free", async () => {
      const { userId, organizationId } = await pair();
      const key = memberLockKey(userId, organizationId);
      const error = await track(
        withMemberLock(
          prisma,
          userId,
          organizationId,
          async (tx) => {
            await tx.member.create({ data: memberRow(organizationId, userId, "timeout") });
            await sleep(1_500);
            await tx.member.count({ where: { userId } }); // the transaction has expired by now
          },
          { timeoutMs: 300 },
        ),
      ).then(() => null, (e: Error & { code?: string }) => e);
      expect(error).not.toBeNull();
      expect(error!.code).toBe("P2028"); // Prisma: transaction API error (expired transaction)
      expect(await memberCount(userId, organizationId)).toBe(0);
      expect(await lockPids(key)).toEqual([]);
      let ran = false;
      await withMemberLock(prisma, userId, organizationId, async () => {
        ran = true;
      });
      expect(ran).toBe(true);
    });

    // The lock wait is bounded by timeoutMs (a transaction-local lock_timeout), so a waiter gives up on time, never runs fn and
    // leaves the queue, while the holder keeps the lock.
    it("lock timeout: a waiter gives up within its budget while the lock is held, its callback never runs and it leaves the queue", async () => {
      const { userId, organizationId } = await pair();
      const key = memberLockKey(userId, organizationId);
      const hold = gate();
      const inside = entered();
      const holder = track(withMemberLock(prisma, userId, organizationId, async () => {
        inside.signal();
        await hold.wait;
      }));
      await inside.reached;
      let waiterRan = false;
      const startedAt = Date.now();
      const waiter = track(withMemberLock(prisma, userId, organizationId, async (tx) => {
        waiterRan = true;
        await tx.member.create({ data: memberRow(organizationId, userId, "late") });
      }, { timeoutMs: 400 }));
      const error = await waiter.then(() => null, (e: unknown) => e);
      const elapsed = Date.now() - startedAt;
      expect(error).toBeInstanceOf(MemberLockTimeoutError);
      expect((error as MemberLockTimeoutError).timeoutMs).toBe(400);
      expect(waiterRan).toBe(false);
      expect(elapsed).toBeGreaterThanOrEqual(250);
      expect(elapsed).toBeLessThan(1_500); // bounded by its own budget, not by the holder (which holds until cleanup)
      // Rollback and release: the waiter is out of the queue, the holder still has the lock, and nothing was written.
      expect(await waitingFor(key)).toBe(0);
      expect((await lockPids(key)).map((l) => l.granted)).toEqual([true]);
      expect(await memberCount(userId, organizationId)).toBe(0);
      // The holder is unaffected and a later caller gets the lock normally once it lets go.
      hold.open();
      await holder;
      let laterRan = false;
      await withMemberLock(prisma, userId, organizationId, async () => {
        laterRan = true;
      });
      expect(laterRan).toBe(true);
      expect(await lockPids(key)).toEqual([]);
    });

    it("a caller that gets the lock within its budget runs normally, and fn does not inherit the short lock wait", async () => {
      const { userId, organizationId } = await pair();
      const hold = gate();
      const inside = entered();
      const holder = track(withMemberLock(prisma, userId, organizationId, async () => {
        inside.signal();
        await hold.wait;
      }));
      await inside.reached;
      let lockTimeoutInsideFn = "";
      const waiter = track(withMemberLock(prisma, userId, organizationId, async (tx) => {
        lockTimeoutInsideFn = (await tx.$queryRaw<{ v: string }[]>`SELECT current_setting('lock_timeout') AS v`)[0].v;
        await tx.member.create({ data: memberRow(organizationId, userId, "in-budget") });
        return "done";
      }, { timeoutMs: 5_000 }));
      await sleep(200); // the waiter has queued; release well inside its 5 s budget
      hold.open();
      await holder;
      expect(await waiter).toBe("done");
      expect(lockTimeoutInsideFn).toBe("0"); // the session value, restored after the lock was taken
      expect(await memberCount(userId, organizationId)).toBe(1);
    });

    it("interaction with the transaction timeout: acquiring the lock quickly does not extend the budget; a slow fn still hits P2028 and rolls back", async () => {
      const { userId, organizationId } = await pair();
      const key = memberLockKey(userId, organizationId);
      const error = await track(
        withMemberLock(prisma, userId, organizationId, async (tx) => {
          await tx.member.create({ data: memberRow(organizationId, userId, "slow") });
          await sleep(1_500);
          await tx.member.count({ where: { userId } }); // the transaction has expired by now
        }, { timeoutMs: 300 }),
      ).then(() => null, (e: Error & { code?: string }) => e);
      expect(error).not.toBeNull();
      expect(error).not.toBeInstanceOf(MemberLockTimeoutError); // the lock was free; this is the Prisma transaction timeout
      expect((error as Error & { code?: string }).code).toBe("P2028");
      expect(await memberCount(userId, organizationId)).toBe(0);
      expect(await lockPids(key)).toEqual([]);
    });

    it("rejects a non-positive or too-large timeoutMs before opening a transaction", async () => {
      await expect(withMemberLock(prisma, "u", "o", async () => 1, { timeoutMs: 0 })).rejects.toThrow(RangeError);
      await expect(withMemberLock(prisma, "u", "o", async () => 1, { timeoutMs: Number.NaN })).rejects.toThrow(RangeError);
      await expect(withMemberLock(prisma, "u", "o", async () => 1, { timeoutMs: MAX_TIMEOUT_MS + 1 })).rejects.toThrow(/at most 2147483647/);
    });

    it("pool wait timeout: when no connection is free, maxWaitMs fails the caller and its callback never runs", async () => {
      const a = await pair();
      const b = await pair();
      const smallPool = new Pool({ connectionString: URL_ENV, max: 1 });
      smallPool.on("error", () => undefined);
      const small = new PrismaClient({ adapter: new PrismaPg(smallPool) });
      extraCleanups.push(async () => {
        await small.$disconnect();
        await smallPool.end();
      });
      const hold = gate();
      const inside = entered();
      const holder = track(withMemberLock(small, a.userId, a.organizationId, async () => {
        inside.signal();
        await hold.wait; // keeps the pool's only connection busy
      }));
      await inside.reached;
      let waiterRan = false;
      const startedAt = Date.now();
      const error = await track(
        withMemberLock(small, b.userId, b.organizationId, async () => {
          waiterRan = true;
        }, { maxWaitMs: 300 }),
      ).then(() => null, (e: Error & { code?: string }) => e);
      expect(error).not.toBeNull();
      expect(error!.code).toBe("P2028");
      expect(waiterRan).toBe(false);
      expect(Date.now() - startedAt).toBeLessThan(5_000);
      hold.open();
      await holder;
    });
  });

  describe("deadline and setting scope", () => {
    function smallClient() {
      const smallPool = new Pool({ connectionString: URL_ENV, max: 1 }); // one connection: every query uses the same backend
      smallPool.on("error", () => undefined);
      const small = new PrismaClient({ adapter: new PrismaPg(smallPool) });
      extraCleanups.push(async () => {
        await small.$disconnect();
        await smallPool.end();
      });
      return small;
    }
    const sessionState = async (db: PrismaClient) =>
      (await db.$queryRaw<{ p: number; v: string }[]>`SELECT pg_backend_pid() AS p, current_setting('lock_timeout') AS v`)[0];

    it("exhausted budget (deterministic): time spent waiting for a connection counts, so fn is never invoked and no lock is taken", async () => {
      const a = await pair();
      const b = await pair();
      const small = smallClient();
      const hold = gate();
      const inside = entered();
      const holder = track(withMemberLock(small, a.userId, a.organizationId, async () => {
        inside.signal();
        await hold.wait; // keeps the pool's only connection busy
      }));
      await inside.reached;
      let ran = false;
      const caller = track(withMemberLock(small, b.userId, b.organizationId, async () => {
        ran = true;
      }, { timeoutMs: 200, maxWaitMs: 5_000 }));
      await sleep(500); // well past the caller's 200 ms budget; it is still queued for a connection
      hold.open();
      const error = await caller.then(() => null, (e: unknown) => e);
      await holder;
      expect(error).toBeInstanceOf(MemberLockTimeoutError);
      expect(ran).toBe(false);
      expect(await lockPids(memberLockKey(b.userId, b.organizationId))).toEqual([]);
    });

    it("lock_timeout is transaction-local: the same single pooled connection shows the session value after a lock timeout and after a success", async () => {
      const { userId, organizationId } = await pair();
      const small = smallClient();
      const before = await sessionState(small);
      expect(before.v).toBe("0");

      // Failure path: the restore statement never runs, so only a transaction-local setting can be back to normal afterwards.
      const hold = gate();
      const inside = entered();
      const holder = track(withMemberLock(prisma, userId, organizationId, async () => {
        inside.signal();
        await hold.wait;
      }));
      await inside.reached;
      const error = await withMemberLock(small, userId, organizationId, async () => 1, { timeoutMs: 400 }).then(() => null, (e: unknown) => e);
      expect(error).toBeInstanceOf(MemberLockTimeoutError);
      expect(await sessionState(small)).toEqual(before); // same backend pid, same setting

      // Success path.
      hold.open();
      await holder;
      let insideFn = "";
      await withMemberLock(small, userId, organizationId, async (tx) => {
        insideFn = (await tx.$queryRaw<{ v: string }[]>`SELECT current_setting('lock_timeout') AS v`)[0].v;
      }, { timeoutMs: 2_000 });
      expect(insideFn).toBe("0");
      expect(await sessionState(small)).toEqual(before);
    });

    it("a real database error in the lock statement is not turned into MemberLockTimeoutError", async () => {
      let ran = false;
      // A NUL byte in the key text is rejected by PostgreSQL itself, not by lock_timeout.
      const error = await withMemberLock(prisma, "user\u0000id", "org", async () => {
        ran = true;
      }, { timeoutMs: 2_000 }).then(() => null, (e: unknown) => e);
      expect(error).not.toBeNull();
      expect(error).not.toBeInstanceOf(MemberLockTimeoutError);
      // Same Prisma P2010 shape as a lock timeout, but with PostgreSQL's own code (22021, invalid byte sequence), passed through.
      const shape = error as { code?: string; meta?: { driverAdapterError?: { cause?: { code?: string } } } };
      expect(shape.code).toBe("P2010");
      expect(shape.meta?.driverAdapterError?.cause?.code).toBe("22021");
      expect(ran).toBe(false);
    });
  });

  describe("connection loss", () => {
    it("terminating the lock holder's connection releases the lock to the waiter and fails the holder", async () => {
      const { userId, organizationId } = await pair();
      const key = memberLockKey(userId, organizationId);
      const hold = gate();
      const inside = entered();
      let holderPid = 0;
      const holder = track(withMemberLock(prisma, userId, organizationId, async (tx) => {
        holderPid = (await tx.$queryRaw<{ p: number }[]>`SELECT pg_backend_pid() AS p`)[0].p;
        inside.signal();
        await hold.wait;
        await tx.member.count({ where: { userId } }); // fails: the connection is gone
      }));
      const holderResult = holder.then(() => "ok", () => "failed");
      await inside.reached;
      let waiterRan = false;
      const waiter = track(withMemberLock(prisma, userId, organizationId, async () => {
        waiterRan = true;
      }));
      await waitUntil(async () => (await waitingFor(key)) === 1, "the waiter to queue on the lock");

      // Terminates only the one backend this test captured, and only if it is this role's session on this database.
      const killed = await observer.query(
        `SELECT pg_terminate_backend(pid) AS ok FROM pg_stat_activity WHERE pid = $1 AND datname = current_database() AND usename = current_user AND pid <> pg_backend_pid()`,
        [holderPid],
      );
      expect(killed.rows).toEqual([{ ok: true }]);

      await waiter; // PostgreSQL released the lock when the connection ended
      expect(waiterRan).toBe(true);
      hold.open();
      expect(await holderResult).toBe("failed");
    });
  });

  describe("cleanup", () => {
    it("cleanup finishes open transactions and leaves no fixture rows, as it must after a test that threw midway", async () => {
      const { userId, organizationId } = await pair();
      const hold = gate();
      const inside = entered();
      track(withMemberLock(prisma, userId, organizationId, async (tx) => {
        await tx.member.create({ data: memberRow(organizationId, userId, "dangling") }); // uncommitted, lock held
        inside.signal();
        await hold.wait;
      }));
      await inside.reached;
      // Here a failing test would have thrown. Run the same cleanup that afterEach runs.
      await cleanup();
      expect(await fixtureRows()).toEqual({ users: 0, organizations: 0, members: 0 });
      const open = await observer.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle in transaction'`);
      expect(open.rows[0].n).toBe(0);
    });
  });
});

// Unit tests with a stub transaction: no database. They pin down how errors are classified and the deadline checks.
describe("withMemberLock (stub transaction, no database)", () => {
  type Call = { sql: string; values: unknown[] };
  function stub(opts: { onLock?: () => Promise<unknown>; beforeCallback?: () => Promise<void> } = {}) {
    const calls: Call[] = [];
    const options: Array<{ maxWait: number; timeout: number }> = [];
    const tx = {
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push({ sql: strings.join("?"), values });
        return strings.join("?").includes("current_setting") ? [{ v: "0" }] : [];
      },
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push({ sql: strings.join("?"), values });
        return opts.onLock ? opts.onLock() : 1;
      },
    } as unknown as MemberLockTx;
    const db = {
      $transaction: async (fn: (t: MemberLockTx) => Promise<unknown>, o: { maxWait: number; timeout: number }) => {
        options.push(o);
        await opts.beforeCallback?.();
        return fn(tx);
      },
    } as unknown as Parameters<typeof withMemberLock>[0];
    return { db, calls, options };
  }
  const lockError = (code: string) => Object.assign(new Error("raw query failed"), { code: "P2010", meta: { driverAdapterError: { cause: { code } } } });

  it("converts only the supported 55P03 shape into MemberLockTimeoutError, and does not call fn", async () => {
    const { db } = stub({ onLock: async () => { throw lockError("55P03"); } });
    let ran = false;
    const error = await withMemberLock(db, "u", "o", async () => { ran = true; }, { timeoutMs: 5_000 }).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(MemberLockTimeoutError);
    expect(ran).toBe(false);
  });

  it.each([
    ["deadlock 40P01 in the supported shape", lockError("40P01")],
    ["Prisma P2028 (transaction expired)", Object.assign(new Error("Transaction already closed"), { code: "P2028" })],
    ["55P03 in an unsupported shape (meta.code)", Object.assign(new Error("x"), { code: "P2010", meta: { code: "55P03" } })],
    ["a plain error", new Error("boom")],
  ])("rethrows %s unchanged", async (_label, thrown) => {
    const { db } = stub({ onLock: async () => { throw thrown; } });
    let ran = false;
    const error = await withMemberLock(db, "u", "o", async () => { ran = true; }, { timeoutMs: 5_000 }).then(() => null, (e: unknown) => e);
    expect(error).toBe(thrown); // the very same object, not wrapped
    expect(error).not.toBeInstanceOf(MemberLockTimeoutError);
    expect(ran).toBe(false);
  });

  it("budget exhausted before the callback starts (deterministic): no SQL is issued and fn is not called", async () => {
    const { db, calls } = stub({ beforeCallback: async () => { await sleep(150); } });
    let ran = false;
    const error = await withMemberLock(db, "u", "o", async () => { ran = true; }, { timeoutMs: 50 }).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(MemberLockTimeoutError);
    expect(calls).toEqual([]);
    expect(ran).toBe(false);
  });

  it("budget exhausted while the lock was being taken: fn is not called even though the lock was granted", async () => {
    const { db, calls } = stub({ onLock: () => sleep(150) });
    let ran = false;
    const error = await withMemberLock(db, "u", "o", async () => { ran = true; }, { timeoutMs: 100 }).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(MemberLockTimeoutError);
    expect(ran).toBe(false);
    expect(calls.some((c) => c.sql.includes("pg_advisory_xact_lock"))).toBe(true); // the lock statement did run
  });

  it("sets lock_timeout to a whole number of ms within PostgreSQL's range, then restores the previous value", async () => {
    for (const timeoutMs of [1_000, 25, MAX_TIMEOUT_MS]) {
      const { db, calls } = stub();
      await withMemberLock(db, "u", "o", async () => undefined, { timeoutMs });
      const sets = calls.filter((c) => c.sql.includes("set_config"));
      expect(sets).toHaveLength(2);
      const wait = Number(sets[0].values[0]);
      expect(Number.isInteger(wait)).toBe(true);
      expect(wait).toBeGreaterThanOrEqual(1);
      expect(wait).toBeLessThanOrEqual(Math.min(timeoutMs, MAX_TIMEOUT_MS));
      expect(sets[1].values[0]).toBe("0"); // previous value put back
    }
  });

  it.each([
    ["timeoutMs", 0],
    ["timeoutMs", -1],
    ["timeoutMs", Number.NaN],
    ["timeoutMs", Number.POSITIVE_INFINITY],
    ["timeoutMs", MAX_TIMEOUT_MS + 1],
    ["maxWaitMs", 0],
    ["maxWaitMs", -5],
    ["maxWaitMs", Number.NaN],
    ["maxWaitMs", Number.POSITIVE_INFINITY],
    ["maxWaitMs", MAX_TIMEOUT_MS + 1],
  ])("rejects %s = %s with a RangeError before any SQL or transaction", async (name, value) => {
    const { db, calls } = stub();
    let transactions = 0;
    const counting = { $transaction: (...a: Parameters<typeof db.$transaction>) => { transactions++; return db.$transaction(...a); } } as typeof db;
    await expect(withMemberLock(counting, "u", "o", async () => 1, { [name]: value })).rejects.toThrow(RangeError);
    expect(transactions).toBe(0);
    expect(calls).toEqual([]);
  });

  it("accepts the largest allowed maxWaitMs and passes it, and the default 5000, to Prisma unchanged", async () => {
    const big = stub();
    await withMemberLock(big.db, "u", "o", async () => 1, { maxWaitMs: MAX_TIMEOUT_MS });
    const dflt = stub();
    await withMemberLock(dflt.db, "u", "o", async () => 1);
    expect(big.options).toEqual([{ maxWait: MAX_TIMEOUT_MS, timeout: 10_000 }]);
    expect(dflt.options).toEqual([{ maxWait: 5_000, timeout: 10_000 }]);
  });

  it("a budget too small to attempt the lock fails without calling fn", async () => {
    const { db } = stub();
    let ran = false;
    const error = await withMemberLock(db, "u", "o", async () => { ran = true; }, { timeoutMs: 0.2 }).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(MemberLockTimeoutError);
    expect(ran).toBe(false);
  });
});
