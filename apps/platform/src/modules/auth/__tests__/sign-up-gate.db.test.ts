import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isRegisteredProduct } from "../branding";
import { PRODUCT_CLIENT_HEADER } from "../sign-up-gate";
import { Jar, TEST_PRODUCT, call, openHarness, testUrl, type Harness } from "./helpers";

// Sign-up is open only to a person who started from a registered product (AJ, 2026-11-10), against the isolated identity test database.
describe.skipIf(!testUrl)("sign-up only from a product", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await openHarness();
    await h.pool.query(`insert into "oauthClient" ("id", "clientId", "name", "disabled", "redirectUris", "createdAt", "updatedAt") values ('gate-off', 'gate-off', 'Off Product', true, '["http://off.localhost:3500/auth/callback"]'::jsonb, now(), now())`);
  }, 60_000);
  afterAll(async () => {
    await h?.pool.end();
  });

  const body = (to: string) => ({ email: to, password: "correct horse 7", name: "Gate Person", firstName: "Gate", lastName: "Person", phone: "+919800000123" });
  const signUp = (to: string, headers?: Record<string, string>) => call(h, new Jar(), "POST", "/api/auth/sign-up/email", body(to), undefined, headers);
  const exists = async (to: string) => (await h.pool.query('select 1 from "user" where email = $1', [to])).rowCount === 1;

  it("knows a registered product, and nothing else", async () => {
    expect(await isRegisteredProduct(h.pool, TEST_PRODUCT)).toBe(true);
    for (const id of ["platterly-account", "platterly-store", "gate-off", "no-such-client", "", null, undefined, "x'; drop table \"user\";--"]) expect(await isRegisteredProduct(h.pool, id), String(id)).toBe(false);
  });

  // The identity provider limits sign-ups to 5 a minute, and a refusal counts, so this file makes exactly 5: one allowed, four refused.
  it("allows a sign-up that names a registered product, and that person can then sign in with no product named (sign-in is untouched)", async () => {
    const res = await signUp("gate-ok@example.com", { [PRODUCT_CLIENT_HEADER]: TEST_PRODUCT });
    expect(res.status).toBe(200);
    expect(await exists("gate-ok@example.com")).toBe(true);
    await h.pool.query(`update "user" set "emailVerified" = true where email = 'gate-ok@example.com'`);
    const signIn = await call(h, new Jar(), "POST", "/api/auth/sign-in/email", { email: "gate-ok@example.com", password: "correct horse 7" }, undefined, {});
    expect(signIn.status).toBe(200);
  });

  it("refuses with 403 and creates nobody when the request names no product, the Account, the Store, a disabled or an unknown product (the Store and an empty name are covered by the first test)", async () => {
    const cases: Record<string, string>[] = [{}, { [PRODUCT_CLIENT_HEADER]: "platterly-account" }, { [PRODUCT_CLIENT_HEADER]: "gate-off" }, { [PRODUCT_CLIENT_HEADER]: "no-such-client" }];
    for (const [n, headers] of cases.entries()) {
      const to = `gate-no-${n}@example.com`;
      const res = await signUp(to, headers);
      expect(res.status, JSON.stringify(headers)).toBe(403);
      expect((await res.json()).code).toBe("SIGN_UP_FROM_PRODUCT_ONLY");
      expect(await exists(to)).toBe(false);
    }
  });
});
