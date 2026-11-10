import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Jar, call, lastCode, openHarness, testUrl, type Harness } from "./helpers";

// A held account (the old address cancelled an email change) cannot start a session through the identity provider. Identity test database only; with no Ops
// configured here the check fails closed, which is what keeps the person out.
const PASSWORD = "correct horse 7";

describe.skipIf(!testUrl)("sign-in of a held account", () => {
  let h: Harness;
  beforeAll(async () => { h = await openHarness(); }, 60_000);
  afterAll(async () => h?.pool.end());
  beforeEach(async () => {
    await h.pool.query('delete from "rateLimit"; delete from "accountHold"; delete from "emailChange"; delete from session; delete from account; delete from verification; delete from "user"');
    h.codes.length = 0;
  });

  async function person(to: string) {
    const jar = new Jar();
    await call(h, jar, "POST", "/api/auth/sign-up/email", { email: to, password: PASSWORD, name: "Held Person", firstName: "Held", lastName: "Person", phone: "+919800000123" });
    await call(h, jar, "POST", "/api/auth/email-otp/verify-email", { email: to, otp: lastCode(h, to, "email-verification")!.otp });
    await call(h, jar, "POST", "/api/auth/sign-out");
    return (await h.pool.query('select "id" from "user" where email = $1', [to])).rows[0].id as string;
  }

  it("is refused with ACCOUNT_ON_HOLD and no session is created; someone not held signs in normally; after the hold is lifted the person can sign in", async () => {
    const heldId = await person("held@auth.test");
    await person("free@auth.test");
    await h.pool.query(`insert into "emailChange" ("id", "userId", "oldEmail", "newEmail", "status") values ('chg-held', $1, 'held@auth.test', 'x@y.test', 'cancelled')`, [heldId]);
    await h.pool.query(`insert into "accountHold" ("userId", "reviewId", "reason") values ($1, 'chg-held', 'not_me')`, [heldId]);
    const before = Number((await h.pool.query('select count(*) from session where "userId" = $1', [heldId])).rows[0].count);

    const refused = await call(h, new Jar(), "POST", "/api/auth/sign-in/email", { email: "held@auth.test", password: PASSWORD });
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { code?: string }).code).toBe("ACCOUNT_ON_HOLD");
    expect(Number((await h.pool.query('select count(*) from session where "userId" = $1', [heldId])).rows[0].count)).toBe(before);

    expect((await call(h, new Jar(), "POST", "/api/auth/sign-in/email", { email: "free@auth.test", password: PASSWORD })).status).toBe(200);

    await h.pool.query('update "accountHold" set "liftedAt" = now() where "userId" = $1', [heldId]);
    expect((await call(h, new Jar(), "POST", "/api/auth/sign-in/email", { email: "held@auth.test", password: PASSWORD })).status).toBe(200);
  });
});
