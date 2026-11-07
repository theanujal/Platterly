import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildExport, cancelDeletion, getDeletionStatus, requestDeletion } from "../data-rights";
import { recordSignIn } from "../sign-in-history";
import { openHarness, testUrl, type Harness } from "../../auth/__tests__/helpers";

describe.skipIf(!testUrl)("data export and deletion request (identity test database)", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await openHarness();
  }, 60_000);
  afterAll(async () => h?.pool.end());
  beforeEach(async () => {
    await h.pool.query('delete from "deletionRequest"; delete from "signInEvent"; delete from "accountProfile"; delete from session; delete from account; delete from "user"');
    await h.pool.query(`insert into "user" (id, name, "firstName", "lastName", phone, email, "emailVerified") values ('u1', 'Asha Rao', 'Asha', 'Rao', '+919800000123', 'u1@x.test', true), ('u2', 'U Two', 'U', 'Two', '+919800000124', 'u2@x.test', true)`);
    await h.pool.query(`insert into account (id, "accountId", "providerId", "userId", password, "updatedAt") values ('a1', 'u1', 'credential', 'u1', 'SECRET-HASH-VALUE', now())`);
    await h.pool.query(`insert into session (id, token, "userId", "expiresAt", "updatedAt", "userAgent") values ('s1', 'SECRET-TOKEN', 'u1', now() + interval '1 day', now(), 'Chrome/1 Safari/1 Macintosh')`);
  });

  it("the export holds the person's own details and history and no secret or other person", async () => {
    await recordSignIn(h.pool, { userId: "u1", outcome: "signed_in", userAgent: "Chrome/1 Safari/1 Macintosh" });
    await recordSignIn(h.pool, { userId: "u2", outcome: "signed_in" });
    const data = (await buildExport(h.pool, "u1", "s1", { name: "Test Kitchen", role: "Admin", status: "active" }))!;
    expect(data.profile).toMatchObject({ firstName: "Asha", lastName: "Rao", email: "u1@x.test", phone: "+919800000123", hasPhoto: false });
    expect(data.business).toEqual({ name: "Test Kitchen", role: "Admin", status: "active" });
    expect(data.signInHistory).toHaveLength(1);
    expect(data.signedInDevices).toEqual([expect.objectContaining({ current: true })]);
    const text = JSON.stringify(data);
    for (const secret of ["SECRET-HASH-VALUE", "SECRET-TOKEN", "u2@x.test", "+919800000124", '"password"', '"token"']) expect(text).not.toContain(secret);
    expect(await buildExport(h.pool, "ghost", "s1", null)).toBeNull();
  });
  it("a deletion request is recorded once, can be withdrawn, and can be made again", async () => {
    expect(await getDeletionStatus(h.pool, "u1")).toEqual({ status: "none" });
    expect(await requestDeletion(h.pool, "u1", { hasBusiness: false, reason: "  leaving  " })).toEqual({ ok: true });
    expect((await getDeletionStatus(h.pool, "u1")).status).toBe("pending");
    expect(await requestDeletion(h.pool, "u1", { hasBusiness: false })).toEqual({ ok: false, reason: "already_pending" });
    expect((await getDeletionStatus(h.pool, "u2")).status).toBe("none");
    expect(await cancelDeletion(h.pool, "u1")).toBe(true);
    expect(await cancelDeletion(h.pool, "u1")).toBe(false);
    expect(await requestDeletion(h.pool, "u1", { hasBusiness: false })).toEqual({ ok: true });
    expect((await h.pool.query(`select reason from "deletionRequest" where "userId" = 'u1' order by "requestedAt" limit 1`)).rows[0].reason).toBe("leaving");
  });
  it("a person with an active business is refused and nothing is recorded", async () => {
    expect(await requestDeletion(h.pool, "u1", { hasBusiness: true })).toEqual({ ok: false, reason: "has_business" });
    expect((await h.pool.query('select count(*) from "deletionRequest"')).rows[0].count).toBe("0");
  });
});
