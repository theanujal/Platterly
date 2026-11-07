import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MAX_TRIES, confirmRecovery, getRecovery, recoveryAddressFor, removeRecovery, startRecovery } from "../recovery-email";
import { openHarness, testUrl, type Harness } from "../../auth/__tests__/helpers";

const SECRET = "test-secret-".padEnd(48, "x");

describe.skipIf(!testUrl)("recovery email (identity test database)", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await openHarness();
  }, 60_000);
  afterAll(async () => h?.pool.end());
  beforeEach(async () => {
    await h.pool.query('delete from "recoveryEmail"; delete from session; delete from account; delete from "user"');
    await h.pool.query(`insert into "user" (id, name, email, "emailVerified") values ('u1', 'U One', 'u1@x.test', true), ('u2', 'U Two', 'u2@x.test', true)`);
  });
  const t0 = new Date("2026-11-07T10:00:00Z");
  const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

  it("adds a recovery email only after its code is confirmed, and finds it by the main email", async () => {
    const started = await startRecovery(h.pool, SECRET, "u1", "u1@x.test", "  Backup@Y.test ", t0);
    if (!started.ok) throw new Error("expected ok");
    expect(started.to).toBe("backup@y.test");
    expect(await getRecovery(h.pool, "u1", at(1))).toMatchObject({ email: null, pendingEmail: "backup@y.test" });
    expect((await getRecovery(h.pool, "u1", at(11 * 60))).pendingEmail, "an expired change is not shown").toBeNull();
    expect(await recoveryAddressFor(h.pool, "u1@x.test"), "an unconfirmed address is never used").toBeNull();
    // only a hash of the code is stored
    expect(JSON.stringify((await h.pool.query('select * from "recoveryEmail"')).rows)).not.toContain(started.code);
    expect(await confirmRecovery(h.pool, SECRET, "u1", started.code, at(60))).toBe("ok");
    expect(await getRecovery(h.pool, "u1", at(61))).toEqual({ email: "backup@y.test", pendingEmail: null });
    expect(await recoveryAddressFor(h.pool, "U1@X.test")).toEqual({ userId: "u1", to: "backup@y.test" });
    expect(await recoveryAddressFor(h.pool, "u2@x.test")).toBeNull();
  });
  it("refuses a bad address, the main email, and a second code within 55 seconds", async () => {
    for (const bad of ["", "nope", "a@b", 5, "x".repeat(250) + "@y.test"]) expect((await startRecovery(h.pool, SECRET, "u1", "u1@x.test", bad, t0)).ok, String(bad)).toBe(false);
    expect(await startRecovery(h.pool, SECRET, "u1", "u1@x.test", " U1@X.test", t0)).toEqual({ ok: false, reason: "same_as_main" });
    expect((await startRecovery(h.pool, SECRET, "u1", "u1@x.test", "a@y.test", t0)).ok).toBe(true);
    expect(await startRecovery(h.pool, SECRET, "u1", "u1@x.test", "a@y.test", at(10))).toEqual({ ok: false, reason: "too_soon" });
    expect((await startRecovery(h.pool, SECRET, "u1", "u1@x.test", "a@y.test", at(56))).ok).toBe(true);
  });
  it("a wrong code is counted, five wrong tries lock that code, and an old code stops working", async () => {
    const started = await startRecovery(h.pool, SECRET, "u1", "u1@x.test", "a@y.test", t0);
    if (!started.ok) throw new Error("expected ok");
    for (let i = 0; i < MAX_TRIES; i++) expect(await confirmRecovery(h.pool, SECRET, "u1", "000000" === started.code ? "111111" : "000000", at(5))).toBe("wrong_code");
    expect(await confirmRecovery(h.pool, SECRET, "u1", started.code, at(6))).toBe("too_many_tries");
    const next = await startRecovery(h.pool, SECRET, "u1", "u1@x.test", "a@y.test", at(70));
    if (!next.ok) throw new Error("expected ok");
    expect(await confirmRecovery(h.pool, SECRET, "u1", started.code === next.code ? "999999" : started.code, at(71))).toBe("wrong_code");
    expect(await confirmRecovery(h.pool, SECRET, "u1", next.code, at(70 + 11 * 60))).toBe("expired");
    expect(await confirmRecovery(h.pool, SECRET, "u2", "123456", at(5))).toBe("nothing_pending");
  });
  it("changing keeps the old address in use until the new one is confirmed; removing ends its use", async () => {
    const first = await startRecovery(h.pool, SECRET, "u1", "u1@x.test", "old@y.test", t0);
    if (!first.ok) throw new Error("expected ok");
    await confirmRecovery(h.pool, SECRET, "u1", first.code, at(5));
    const second = await startRecovery(h.pool, SECRET, "u1", "u1@x.test", "new@y.test", at(100));
    if (!second.ok) throw new Error("expected ok");
    expect(await recoveryAddressFor(h.pool, "u1@x.test")).toEqual({ userId: "u1", to: "old@y.test" });
    await confirmRecovery(h.pool, SECRET, "u1", second.code, at(110));
    expect(await recoveryAddressFor(h.pool, "u1@x.test")).toEqual({ userId: "u1", to: "new@y.test" });
    expect(await removeRecovery(h.pool, "u1")).toBe(true);
    expect(await recoveryAddressFor(h.pool, "u1@x.test")).toBeNull();
    expect(await removeRecovery(h.pool, "u1")).toBe(false);
  });
});
