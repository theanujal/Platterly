import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isRegisteredProduct } from "../branding";
import { OAUTH_QUERY_HEADER } from "../sign-up-gate";
import { signedProduct } from "../sign-up-origin";
import { Jar, TEST_PRODUCT, call, openHarness, signedSignInQuery, testUrl, type Harness } from "./helpers";

const SECRET = "test-secret-".padEnd(48, "x");

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

  // The identity provider limits sign-ups to 10 a minute, and a refusal counts: this file makes 1 allowed and 6 refused.
  it("allows a sign-up that carries a sign-in address the provider signed for a registered product, and that person can then sign in with no product named (sign-in is untouched)", async () => {
    const res = await signUp("gate-ok@example.com", { [OAUTH_QUERY_HEADER]: await signedSignInQuery(h) });
    expect(res.status).toBe(200);
    expect(await exists("gate-ok@example.com")).toBe(true);
    await h.pool.query(`update "user" set "emailVerified" = true where email = 'gate-ok@example.com'`);
    const signIn = await call(h, new Jar(), "POST", "/api/auth/sign-in/email", { email: "gate-ok@example.com", password: "correct horse 7" }, undefined, {});
    expect(signIn.status).toBe(200);
  });

  it("the server knows the product from the signature: it reads a good address, and refuses a missing, hand-written, tampered, swapped or first-party one", async () => {
    const good = await signedSignInQuery(h);
    expect(await signedProduct(h.pool, good, SECRET)).toBe(TEST_PRODUCT);
    const account = await signedSignInQuery(h, "platterly-account", "http://account.localhost:3300/auth/callback");
    const swapped = new URLSearchParams(account);
    swapped.set("client_id", TEST_PRODUCT); // an Account address with the product's name written in
    const tampered = new URLSearchParams(good);
    tampered.set("state", "other"); // any change breaks the signature
    const expired = new URLSearchParams(good);
    expired.set("exp", "1000");
    const cases: Record<string, string | null> = {
      none: null,
      empty: "",
      "name only, written by hand": `client_id=${TEST_PRODUCT}`,
      "name with a made-up signature": `client_id=${TEST_PRODUCT}&sig=abc&exp=${Math.floor(Date.now() / 1000) + 600}`,
      "account address, product name written in": swapped.toString(),
      tampered: tampered.toString(),
      expired: expired.toString(),
      "signed by someone else": good.replace(/sig=[^&]*/, "sig=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
      "a real Account address (first-party)": account,
    };
    for (const [name, query] of Object.entries(cases)) expect(await signedProduct(h.pool, query, SECRET), name).toBeNull();
  });

  it("refuses with 403 and creates nobody when the request has no signed address, a hand-written one, or one for the Account", async () => {
    const account = await signedSignInQuery(h, "platterly-account", "http://account.localhost:3300/auth/callback");
    const cases: Record<string, string>[] = [{}, { [OAUTH_QUERY_HEADER]: `client_id=${TEST_PRODUCT}` }, { "x-platterly-client": TEST_PRODUCT }, { [OAUTH_QUERY_HEADER]: account }];
    for (const [n, headers] of cases.entries()) {
      const to = `gate-no-${n}@example.com`;
      const res = await signUp(to, headers);
      expect(res.status, JSON.stringify(headers)).toBe(403);
      expect((await res.json()).code).toBe("SIGN_UP_FROM_PRODUCT_ONLY");
      expect(await exists(to)).toBe(false);
    }
  });
});
