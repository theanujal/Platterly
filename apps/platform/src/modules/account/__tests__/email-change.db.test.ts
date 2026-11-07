import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HOLD_HOURS, MAX_TRIES, cancelChange, confirmChange, emailChangeHold, pendingChange, startChange, type Sync } from "../email-change";
import { openHarness, testUrl, type Harness } from "../../auth/__tests__/helpers";

const SECRET = "test-secret-".padEnd(48, "x");

describe.skipIf(!testUrl)("change of sign-in email (identity test database)", () => {
  let h: Harness;
  let synced: { userId: string; from: string; to: string }[];
  const ok: Sync = async (c) => void synced.push(c);
  beforeAll(async () => {
    h = await openHarness();
  }, 60_000);
  afterAll(async () => h?.pool.end());
  beforeEach(async () => {
    synced = [];
    await h.pool.query('delete from "emailChange"; delete from "recoveryEmail"; delete from session; delete from account; delete from "user"');
    await h.pool.query(`insert into "user" (id, name, email, "emailVerified") values ('u1', 'U One', 'u1@x.test', true), ('u2', 'U Two', 'u2@x.test', true)`);
  });
  const t0 = new Date("2026-11-07T10:00:00Z");
  const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);
  const u1 = { id: "u1", email: "u1@x.test" };
  const emailOf = async (id: string) => (await h.pool.query('select email from "user" where id = $1', [id])).rows[0].email as string;

  async function started(to = "New@Y.test", when = t0) {
    const s = await startChange(h.pool, SECRET, u1, to, when);
    if (!s.ok) throw new Error(`expected ok, got ${s.reason}`);
    return s;
  }

  it("changes nothing until the code is right; then the email changes, the Platform copy is synced, and a 72-hour hold opens", async () => {
    const s = await started();
    expect(s.to).toBe("new@y.test");
    expect(await emailOf("u1")).toBe("u1@x.test");
    expect(await pendingChange(h.pool, "u1", at(1))).toEqual({ newEmail: "new@y.test" });
    expect(JSON.stringify((await h.pool.query('select * from "emailChange"')).rows)).not.toContain(s.code);
    const done = await confirmChange(h.pool, SECRET, "u1", s.code, ok, at(60));
    if (!done.ok) throw new Error("expected ok");
    expect(done).toMatchObject({ oldEmail: "u1@x.test", newEmail: "new@y.test" });
    expect(await emailOf("u1")).toBe("new@y.test");
    expect((await h.pool.query('select "emailVerified" from "user" where id = $1', ["u1"])).rows[0].emailVerified).toBe(true);
    expect(synced).toEqual([{ userId: "u1", from: "u1@x.test", to: "new@y.test" }]);
    expect(done.holdUntil.getTime() - at(60).getTime()).toBe(HOLD_HOURS * 3_600_000);
    expect(await emailChangeHold(h.pool, "u1", at(61))).toEqual({ until: done.holdUntil.toISOString() });
    expect(await emailChangeHold(h.pool, "u1", new Date(done.holdUntil.getTime() + 1))).toBeNull();
    expect(await emailChangeHold(h.pool, "u2", at(61))).toBeNull();
    expect(JSON.stringify((await h.pool.query('select * from "emailChange"')).rows)).not.toContain(done.cancelToken);
  });
  it("refuses a bad address, the current one, an address another person has, and a second code within 55 seconds", async () => {
    for (const bad of ["", "nope", 5, "a@b"]) expect((await startChange(h.pool, SECRET, u1, bad, t0)).ok, String(bad)).toBe(false);
    expect(await startChange(h.pool, SECRET, u1, " U1@X.test ", t0)).toEqual({ ok: false, reason: "same" });
    expect(await startChange(h.pool, SECRET, u1, "U2@x.test", t0)).toEqual({ ok: false, reason: "unavailable" });
    await started("a@y.test");
    expect(await startChange(h.pool, SECRET, u1, "a@y.test", at(10))).toEqual({ ok: false, reason: "too_soon" });
    expect((await startChange(h.pool, SECRET, u1, "a@y.test", at(56))).ok).toBe(true);
  });
  it("wrong codes are counted and lock that code; an expired code is refused; nobody confirms another person's change", async () => {
    const s = await started();
    for (let i = 0; i < MAX_TRIES; i++) expect(await confirmChange(h.pool, SECRET, "u1", s.code === "000000" ? "111111" : "000000", ok, at(5))).toEqual({ ok: false, reason: "wrong_code" });
    expect(await confirmChange(h.pool, SECRET, "u1", s.code, ok, at(6))).toEqual({ ok: false, reason: "too_many_tries" });
    const s2 = await started("b@y.test", at(70));
    expect(await confirmChange(h.pool, SECRET, "u2", s2.code, ok, at(71))).toEqual({ ok: false, reason: "nothing_pending" });
    expect(await confirmChange(h.pool, SECRET, "u1", s2.code, ok, at(70 + 11 * 60))).toEqual({ ok: false, reason: "expired" });
    expect(await emailOf("u1")).toBe("u1@x.test");
    expect(synced).toEqual([]);
  });
  it("if the Platform copy cannot be changed, the identity change is rolled back and the code can be tried again", async () => {
    const s = await started();
    const failing: Sync = async () => {
      throw new Error("platform down");
    };
    expect(await confirmChange(h.pool, SECRET, "u1", s.code, failing, at(5))).toEqual({ ok: false, reason: "unavailable" });
    expect(await emailOf("u1")).toBe("u1@x.test");
    expect((await confirmChange(h.pool, SECRET, "u1", s.code, ok, at(6))).ok).toBe(true);
  });
  it("another person who took the address while the code was waiting wins: the change is refused", async () => {
    const s = await started("race@y.test");
    await h.pool.query(`update "user" set email = 'race@y.test' where id = 'u2'`);
    expect(await confirmChange(h.pool, SECRET, "u1", s.code, ok, at(5))).toEqual({ ok: false, reason: "unavailable" });
    expect(await emailOf("u1")).toBe("u1@x.test");
  });
  it("a recovery email that equals the new main email is dropped", async () => {
    await h.pool.query(`insert into "recoveryEmail" ("userId", "email", "verifiedAt") values ('u1', 'new@y.test', now())`);
    const s = await started();
    await confirmChange(h.pool, SECRET, "u1", s.code, ok, at(5));
    expect((await h.pool.query('select count(*) from "recoveryEmail"')).rows[0].count).toBe("0");
  });
  it("the old address's cancel token puts the old email back inside the 72 hours, once, and not after", async () => {
    const s = await started();
    const done = await confirmChange(h.pool, SECRET, "u1", s.code, ok, at(5));
    if (!done.ok) throw new Error("expected ok");
    expect(await cancelChange(h.pool, SECRET, "wrong-token-wrong-token-wrong", ok, at(10))).toEqual({ ok: false, reason: "invalid" });
    expect(await cancelChange(h.pool, SECRET, 5, ok, at(10))).toEqual({ ok: false, reason: "invalid" });
    synced = [];
    const cancelled = await cancelChange(h.pool, SECRET, done.cancelToken, ok, at(100));
    expect(cancelled).toEqual({ ok: true, userId: "u1", restoredEmail: "u1@x.test", newEmail: "new@y.test" });
    expect(await emailOf("u1")).toBe("u1@x.test");
    expect(synced).toEqual([{ userId: "u1", from: "new@y.test", to: "u1@x.test" }]);
    expect(await emailChangeHold(h.pool, "u1", at(101))).toBeNull();
    expect(await cancelChange(h.pool, SECRET, done.cancelToken, ok, at(200))).toEqual({ ok: false, reason: "already_cancelled" });
  });
  it("after 72 hours the cancel link no longer works, and it refuses when another account now holds the old address", async () => {
    const a = await started();
    const done = await confirmChange(h.pool, SECRET, "u1", a.code, ok, at(5));
    if (!done.ok) throw new Error("expected ok");
    expect(await cancelChange(h.pool, SECRET, done.cancelToken, ok, new Date(done.holdUntil.getTime() + 1))).toEqual({ ok: false, reason: "expired" });
    expect(await emailOf("u1")).toBe("new@y.test");
    await h.pool.query(`update "user" set email = 'u1@x.test' where id = 'u2'`);
    expect(await cancelChange(h.pool, SECRET, done.cancelToken, ok, at(100))).toEqual({ ok: false, reason: "unavailable" });
    expect(await emailOf("u1")).toBe("new@y.test");
  });
});
