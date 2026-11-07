import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createLocalJWKSet, decodeJwt } from "jose";
import { validateLogoutToken } from "../../../../../../packages/platform-contract";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { providerSessionEnder } from "../provider-sessions";
import { endAllSessions, endSession } from "../session-store";
import { Jar, call, openHarness, testUrl, type Harness } from "./helpers";

// F4.2.3 against the isolated identity test database: a registered product client with a back-channel logout URL (a local receiver stands in for the
// product), real sign-in and code flows, and the logout token the provider sends when a session ends. Nothing leaves the machine.
const ORIGIN = "http://auth.localhost:3300";
const PASSWORD = "correct horse 7";
const CLIENT = "stub-product";
const REDIRECT = "http://stub.localhost:3500/cb";
let n = 0;
const email = () => `bcl${Date.now()}${n++}@auth.test`;

describe.skipIf(!testUrl)("F4.2.3 back-channel logout", () => {
  let h: Harness;
  let server: http.Server;
  let received: { body: string; contentType: string | undefined }[];
  let status = 200;
  let url = "";

  beforeAll(async () => {
    h = await openHarness();
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ body, contentType: req.headers["content-type"] });
        res.statusCode = status;
        res.end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/logout`;
  }, 60_000);
  afterAll(async () => {
    server?.close();
    await h?.pool.end();
  });
  beforeEach(async () => {
    received = [];
    status = 200;
    await h.pool.query('delete from "oauthAccessToken"; delete from "oauthRefreshToken"; delete from "oauthConsent"; delete from session; delete from account; delete from "user"; delete from "rateLimit"');
    await h.pool.query('delete from "oauthClient" where "clientId" = $1', [CLIENT]);
    await registerProduct(url);
  });

  // The provider checks an id_token_hint against its own JWKS fetched over HTTP from its public address. In this harness that address is the running
  // dev server (other keys), so requests to the provider's origin are answered by the harness provider; everything else goes out unchanged.
  afterEach(() => vi.restoreAllMocks());
  const routeProviderFetch = () => {
    const real = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const target = input instanceof Request ? input.url : String(input);
      return target.startsWith(ORIGIN) ? h.idp.handler(new Request(target, init)) : real(input, init);
    });
  };

  const registerProduct = (logoutUri: string | null, id = CLIENT) =>
    h.pool.query(
      `insert into "oauthClient" ("id", "clientId", "name", "redirectUris", "scopes", "skipConsent", "requirePKCE", "tokenEndpointAuthMethod", "grantTypes", "responseTypes", "applicationType", "disabled", "enableEndSession", "postLogoutRedirectUris", "backchannelLogoutUri", "subjectType", "createdAt", "updatedAt")
       values ($1, $1, 'Stub product', $2::jsonb, '["openid","email","profile"]'::jsonb, true, true, 'none', '["authorization_code"]'::jsonb, '["code"]'::jsonb, 'web', false, true, '["http://stub.localhost:3500/"]'::jsonb, $3, 'public', now(), now())
       on conflict ("clientId") do update set "backchannelLogoutUri" = excluded."backchannelLogoutUri"`,
      [id, JSON.stringify([REDIRECT]), logoutUri],
    );

  async function person() {
    const to = email();
    const jar = new Jar();
    await call(h, jar, "POST", "/api/auth/sign-up/email", { email: to, password: PASSWORD, name: "Test Person" });
    const otp = [...h.codes].reverse().find((c) => c.to === to)!.otp;
    await call(h, jar, "POST", "/api/auth/email-otp/verify-email", { email: to, otp });
    return to;
  }
  /** A new browser session for this person that has also signed in to the product (so the provider knows the product holds a token for it). */
  async function productSession(to: string, clientId = CLIENT) {
    const jar = new Jar();
    expect((await call(h, jar, "POST", "/api/auth/sign-in/email", { email: to, password: PASSWORD })).status).toBe(200);
    const verifier = randomBytes(32).toString("base64url");
    const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, scope: "openid email profile", state: "s", nonce: "n", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
    const authorize = await call(h, jar, "GET", `/api/auth/oauth2/authorize?${q}`);
    const code = new URL(authorize.headers.get("location")!).searchParams.get("code")!;
    const tokenRes = await h.idp.handler(
      new Request(`${ORIGIN}/api/auth/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: new URL(REDIRECT).origin },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier }),
      }),
    );
    expect(tokenRes.status).toBe(200);
    const tokens = (await tokenRes.json()) as { id_token: string; access_token: string };
    const claims = decodeJwt(tokens.id_token);
    return { jar, idToken: tokens.id_token, sid: claims.sid as string, sub: claims.sub as string };
  }
  const ender = () => providerSessionEnder(h.idp);
  const settle = () => new Promise((r) => setTimeout(r, 400));
  async function validate(raw: string, audience = CLIENT) {
    const jwks = createLocalJWKSet((await (await h.idp.handler(new Request(`${ORIGIN}/api/auth/jwks`))).json()) as Parameters<typeof createLocalJWKSet>[0]);
    const issuer = ((await (await h.idp.handler(new Request(`${ORIGIN}/api/auth/.well-known/openid-configuration`))).json()) as { issuer: string }).issuer;
    return validateLogoutToken(new URLSearchParams(raw).get("logout_token") ?? "", { key: jwks, issuer, audience });
  }
  const sessionExists = async (sid: string) => (await h.pool.query('select 1 from session where id = $1', [sid])).rowCount === 1;

  it("ending a session (sign out, or ending one device) sends the product one valid logout token for exactly that session", async () => {
    const to = await person();
    const a = await productSession(to);
    const b = await productSession(to);
    expect(await endSession(h.pool, a.sid, a.sub, await ender())).toBe(true);
    await settle();
    expect(received).toHaveLength(1);
    expect(received[0].contentType).toContain("application/x-www-form-urlencoded");
    expect(await validate(received[0].body)).toMatchObject({ ok: true, sid: a.sid, sub: expect.any(String) });
    expect(await sessionExists(a.sid)).toBe(false);
    expect(await sessionExists(b.sid)).toBe(true);
  });

  it("signing out everywhere sends one logout token per ended session", async () => {
    const to = await person();
    const a = await productSession(to);
    const b = await productSession(to);
    expect(await endAllSessions(h.pool, a.sub, await ender())).toBe(2);
    await settle();
    const sids = (await Promise.all(received.map((r) => validate(r.body)))).map((r) => (r.ok ? r.sid : "invalid"));
    expect(sids.sort()).toEqual([a.sid, b.sid].sort());
    expect(await sessionExists(a.sid)).toBe(false);
    expect(await sessionExists(b.sid)).toBe(false);
  });

  it("another person's sessions are never touched or announced", async () => {
    const one = await productSession(await person());
    const two = await productSession(await person());
    expect(await endSession(h.pool, one.sid, two.sub, await ender())).toBe(false);
    await settle();
    expect(received).toHaveLength(0);
    expect(await sessionExists(one.sid)).toBe(true);
  });

  it("a session the product never signed in to is ended without any logout call, and a product with no logout URL is not called", async () => {
    const to = await person();
    const jar = new Jar();
    await call(h, jar, "POST", "/api/auth/sign-in/email", { email: to, password: PASSWORD });
    const plain = (await h.pool.query('select id, "userId" from session order by "createdAt" desc limit 1')).rows[0];
    expect(await endSession(h.pool, plain.id, plain.userId, await ender())).toBe(true);
    await h.pool.query(`update "oauthClient" set "backchannelLogoutUri" = null where "clientId" = $1`, [CLIENT]);
    const s = await productSession(to);
    expect(await endSession(h.pool, s.sid, s.sub, await ender())).toBe(true);
    await settle();
    expect(received).toHaveLength(0);
  });

  it("a product that is down or answers an error never stops the session from ending", async () => {
    const to = await person();
    status = 500;
    const a = await productSession(to);
    expect(await endSession(h.pool, a.sid, a.sub, await ender())).toBe(true);
    expect(await sessionExists(a.sid)).toBe(false);
    await h.pool.query(`update "oauthClient" set "backchannelLogoutUri" = 'http://127.0.0.1:1/logout' where "clientId" = $1`, [CLIENT]);
    const b = await productSession(to);
    expect(await endSession(h.pool, b.sid, b.sub, await ender())).toBe(true);
    expect(await sessionExists(b.sid)).toBe(false);
  });

  it("RP-initiated logout from the product ends the session and tells the product", async () => {
    const to = await person();
    const a = await productSession(to);
    routeProviderFetch();
    const q = new URLSearchParams({ id_token_hint: a.idToken, post_logout_redirect_uri: "http://stub.localhost:3500/", client_id: CLIENT });
    const res = await call(h, a.jar, "GET", `/api/auth/oauth2/end-session?${q}`);
    expect([200, 302, 303], (await res.clone().text()).slice(0, 400)).toContain(res.status);
    await settle();
    expect(await sessionExists(a.sid)).toBe(false);
    expect(received).toHaveLength(1);
    expect(await validate(received[0].body)).toMatchObject({ ok: true, sid: a.sid });
  });

  it("a replayed or forged logout token is refused by the validator", async () => {
    const to = await person();
    const a = await productSession(to);
    await endSession(h.pool, a.sid, a.sub, await ender());
    await settle();
    expect((await validate(received[0].body, "some-other-product")).ok).toBe(false);
    // Change the payload (a different session id) and keep the old signature: it can never verify. (Flipping the last signature character is not a reliable
    // tamper, because those bits can be padding.)
    const [head, payload, signature] = new URLSearchParams(received[0].body).get("logout_token")!.split(".");
    const forged = { ...JSON.parse(Buffer.from(payload, "base64url").toString()), sid: "another-session" };
    const tampered = new URLSearchParams({ logout_token: [head, Buffer.from(JSON.stringify(forged)).toString("base64url"), signature].join(".") }).toString();
    expect((await validate(tampered)).ok).toBe(false);
  });
});
