import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { changePassword, resetPasswordAttempts } from "../password";
import { openHarness, testUrl, type Harness } from "../../auth/__tests__/helpers";

// Change password against the isolated identity test database: wrong current password, weak and unchanged passwords, the per-person attempt limit,
// and that a success ends every OTHER session but not the current one.
describe.skipIf(!testUrl)("change password (identity test database)", () => {
  let h: Harness;
  let hasher: { hash(p: string): Promise<string>; verify(i: { hash: string; password: string }): Promise<boolean> };
  beforeAll(async () => {
    h = await openHarness();
    hasher = (await h.idp.$context).password;
  }, 60_000);
  afterAll(async () => h?.pool.end());
  beforeEach(async () => {
    resetPasswordAttempts();
    await h.pool.query('delete from session; delete from account; delete from "user"');
    await h.pool.query(`insert into "user" (id, name, email, "emailVerified") values ('u1', 'U One', 'u1@x.test', true), ('u2', 'U Two', 'u2@x.test', true)`);
    for (const id of ["u1", "u2"]) await h.pool.query(`insert into account (id, "accountId", "providerId", "userId", password, "updatedAt") values ('a-' || $1::text, $1, 'credential', $1, $2, now())`, [id, await hasher.hash("old password 1")]);
    for (const [sid, uid] of [["s1", "u1"], ["s2", "u1"], ["s3", "u1"], ["s9", "u2"]]) await h.pool.query(`insert into session (id, token, "userId", "expiresAt", "updatedAt") values ($1, $1 || '-token', $2, now() + interval '1 day', now())`, [sid, uid]);
  });
  const run = (over: Partial<{ current: unknown; next: unknown; userId: string }> = {}) => changePassword(h.pool, hasher, { userId: "u1", currentSessionId: "s1", current: "old password 1", next: "new password 2", ...over });
  const stored = async (id: string) => (await h.pool.query('select password from account where "userId" = $1', [id])).rows[0].password as string;

  it("changes the password, ends the other sessions of that person only, and keeps the current one", async () => {
    expect(await run()).toEqual({ ok: true, endedOthers: 2 });
    expect(await hasher.verify({ hash: await stored("u1"), password: "new password 2" })).toBe(true);
    expect(await hasher.verify({ hash: await stored("u1"), password: "old password 1" })).toBe(false);
    expect((await h.pool.query('select id from session order by id')).rows.map((r) => r.id)).toEqual(["s1", "s9"]);
    expect(await hasher.verify({ hash: await stored("u2"), password: "old password 1" })).toBe(true);
  });
  it("a wrong current password changes nothing and ends nothing", async () => {
    const before = await stored("u1");
    expect(await run({ current: "not it" })).toEqual({ ok: false, reason: "wrong_password" });
    expect(await stored("u1")).toBe(before);
    expect((await h.pool.query("select count(*) from session")).rows[0].count).toBe("4");
  });
  it("refuses a weak, over-long, missing or unchanged new password", async () => {
    expect(await run({ next: "short" })).toEqual({ ok: false, reason: "weak" });
    expect(await run({ next: "x".repeat(129) })).toEqual({ ok: false, reason: "weak" });
    expect(await run({ next: undefined })).toEqual({ ok: false, reason: "weak" });
    expect(await run({ next: "old password 1" })).toEqual({ ok: false, reason: "same" });
  });
  it("after five wrong guesses even the right password is refused until the window passes", async () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect((await changePassword(h.pool, hasher, { userId: "u1", currentSessionId: "s1", current: "nope", next: "new password 2" }, undefined, t + i)).ok).toBe(false);
    expect(await changePassword(h.pool, hasher, { userId: "u1", currentSessionId: "s1", current: "old password 1", next: "new password 2" }, undefined, t + 10)).toEqual({ ok: false, reason: "too_many_attempts" });
    expect((await changePassword(h.pool, hasher, { userId: "u1", currentSessionId: "s1", current: "old password 1", next: "new password 2" }, undefined, t + 16 * 60_000)).ok).toBe(true);
    // another person is not affected
    expect((await changePassword(h.pool, hasher, { userId: "u2", currentSessionId: "s9", current: "old password 1", next: "new password 2" }, undefined, t)).ok).toBe(true);
  });
  it("a person with no password account cannot change one", async () => {
    await h.pool.query(`delete from account where "userId" = 'u1'`);
    expect(await run()).toEqual({ ok: false, reason: "no_password" });
  });
});
