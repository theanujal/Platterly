import { Pool } from "pg";
import { registerAccountClient } from "../clients";
import { IDENTITY_MIGRATIONS_DIR, migrateIdentity } from "../identity-db";
import { createIdp, type Idp } from "../idp";
import type { OtpKind } from "../mailer";
import { OAUTH_QUERY_HEADER } from "../sign-up-gate";

// Test harness for the identity provider against the isolated F4 test database (IDENTITY_TEST_DATABASE_URL). Tests are skipped without it.
/** A registered product the harness creates, and the header every test call sends so sign-up is allowed (see sign-up-gate.ts). */
export const TEST_PRODUCT = "gate-product";
export const testUrl = process.env.IDENTITY_TEST_DATABASE_URL;

export type Harness = { pool: Pool; idp: Idp; codes: { to: string; otp: string; kind: OtpKind }[]; sendFails: { value: boolean } };

export async function openHarness(): Promise<Harness> {
  // The harness rebuilds the whole schema, so it refuses any database whose name does not say "test".
  if (!testUrl || !/\/[^/?]*test[^/?]*(\?|$)/i.test(testUrl)) throw new Error("the identity harness only runs against a database named *test*");
  const pool = new Pool({ connectionString: testUrl, max: 5 });
  await pool.query("drop schema public cascade; create schema public;");
  await migrateIdentity(pool, IDENTITY_MIGRATIONS_DIR);
  await registerAccountClient(pool);
  await pool.query(`insert into "oauthClient" ("id", "clientId", "name", "disabled", "redirectUris", "createdAt", "updatedAt") values ('gate-product', 'gate-product', 'Gate Product', false, '["http://gate.localhost:3500/auth/callback"]'::jsonb, now(), now())`);
  const codes: Harness["codes"] = [];
  const sendFails = { value: false };
  const idp = createIdp({
    rateLimitOff: false,
    pool,
    secret: "test-secret-".padEnd(48, "x"),
    sendOtp: async (to, otp, kind) => {
      if (sendFails.value) throw new Error("mail down");
      codes.push({ to, otp, kind });
    },
  });
  return { pool, idp, codes, sendFails };
}

export const lastCode = (h: Harness, to: string, kind?: OtpKind) => [...h.codes].reverse().find((c) => c.to === to && (kind === undefined || c.kind === kind));

/** Minimal cookie jar for driving the provider's HTTP handler the way a browser would. */
export class Jar {
  private cookies = new Map<string, string>();
  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  absorb(response: Response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attrs.some((a) => /max-age=0/i.test(a)) || value === "";
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  names() {
    return [...this.cookies.keys()];
  }
}

/**
 * The signed sign-in address a product's real link produces: the harness asks the provider's authorize step (with PKCE, as a product does) and keeps the query of
 * the sign-in page it redirects to (`sig`, `exp`, `client_id` ...). Pass another client id to see what happens for the Account or an unknown product.
 */
export async function signedSignInQuery(h: Harness, clientId: string = TEST_PRODUCT, redirectUri = "http://gate.localhost:3500/auth/callback"): Promise<string> {
  const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: "openid email profile", state: "s1", code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", code_challenge_method: "S256" });
  const res = await h.idp.handler(new Request(`http://auth.localhost:3300/api/auth/oauth2/authorize?${q}`, { headers: { origin: "http://auth.localhost:3300", host: "auth.localhost:3300" }, redirect: "manual" }));
  const location = res.headers.get("location") ?? "";
  if (!location.includes("sig=")) throw new Error(`the provider gave no signed sign-in address for ${clientId} (answered ${res.status} ${location.slice(0, 120)})`);
  return new URL(location, "http://auth.localhost:3300").search.replace(/^\?/, "");
}

export async function call(h: Harness, jar: Jar, method: string, path: string, body?: unknown, origin = "http://auth.localhost:3300", extraHeaders?: Record<string, string>): Promise<Response> {
  const headers: Record<string, string> = { origin, host: new URL(origin).host, ...(extraHeaders ?? { [OAUTH_QUERY_HEADER]: await signedSignInQuery(h) }) };
  if (jar.header()) headers.cookie = jar.header();
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await h.idp.handler(new Request(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" }));
  jar.absorb(res);
  return res;
}
