import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HISTORY_LIMIT, listSignInHistory, recordSignIn } from "../sign-in-history";
import { openHarness, testUrl, type Harness } from "../../auth/__tests__/helpers";

describe.skipIf(!testUrl)("sign-in history (identity test database)", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await openHarness();
  }, 60_000);
  afterAll(async () => h?.pool.end());
  beforeEach(async () => {
    await h.pool.query('delete from "signInEvent"; delete from session; delete from account; delete from "user"');
    await h.pool.query(`insert into "user" (id, name, email, "emailVerified") values ('u1', 'U One', 'u1@x.test', true), ('u2', 'U Two', 'u2@x.test', true)`);
  });
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

  it("lists a person's own events newest first, with a plain device label and no address", async () => {
    const t = new Date("2026-11-01T10:00:00Z");
    await recordSignIn(h.pool, { userId: "u1", outcome: "signed_in", userAgent: ua }, t);
    await recordSignIn(h.pool, { userId: "u1", outcome: "wrong_password", userAgent: ua }, new Date(t.getTime() + 1000));
    await recordSignIn(h.pool, { userId: "u2", outcome: "signed_in", userAgent: ua }, t);
    const list = await listSignInHistory(h.pool, "u1", new Date(t.getTime() + 5000));
    expect(list.map((e) => e.outcome)).toEqual(["wrong_password", "signed_in"]);
    expect(list[0].device).toBe("Chrome on a Mac");
    expect(Object.keys(list[0]).sort()).toEqual(["at", "device", "id", "outcome"]);
    expect((await listSignInHistory(h.pool, "u2", t)).length).toBe(1);
  });
  it("keeps 90 days: older events are not listed and are removed at the next write", async () => {
    const now = new Date("2026-11-07T00:00:00Z");
    await recordSignIn(h.pool, { userId: "u1", outcome: "signed_in" }, new Date(now.getTime() - 91 * 86_400_000));
    expect(await listSignInHistory(h.pool, "u1", now)).toEqual([]);
    await recordSignIn(h.pool, { userId: "u1", outcome: "signed_in" }, now);
    expect((await h.pool.query('select count(*) from "signInEvent" where "userId" = \'u1\'')).rows[0].count).toBe("1");
  });
  it("lists at most the newest 50", async () => {
    const now = new Date("2026-11-07T00:00:00Z");
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) await recordSignIn(h.pool, { userId: "u1", outcome: "signed_in" }, new Date(now.getTime() - i * 1000));
    expect((await listSignInHistory(h.pool, "u1", now)).length).toBe(HISTORY_LIMIT);
  });
  it("removing the person removes the history, and a write for a missing person never throws", async () => {
    await recordSignIn(h.pool, { userId: "u1", outcome: "signed_in" });
    await h.pool.query(`delete from "user" where id = 'u1'`);
    expect((await h.pool.query('select count(*) from "signInEvent"')).rows[0].count).toBe("0");
    await expect(recordSignIn(h.pool, { userId: "ghost", outcome: "signed_in" })).resolves.toBeUndefined();
  });
});
