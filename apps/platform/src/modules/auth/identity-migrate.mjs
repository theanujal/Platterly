// Identity database migration and first-party client registration, in plain JavaScript so a Node script can run them without the app
// (scripts/identity-migrate.mjs) and the app and its tests can import the very same code. No other imports: only `pg` objects are passed in.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const ACCOUNT_CLIENT_ID = "platterly-account";
export const STORE_CLIENT_ID = "platterly-store";
export const ACCOUNT_SCOPES = ["openid", "email", "profile"];

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/**
 * Applies `dir/*.sql` in name order, once each, inside a transaction, recording a checksum. A changed, already-applied file is refused.
 * @param {import("pg").Pool} pool
 * @param {string} dir
 * @returns {Promise<{ name: string, checksum: string }[]>} the files applied by this call
 */
export async function migrateIdentity(pool, dir) {
  const client = await pool.connect();
  try {
    await client.query("create table if not exists identity_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())");
    const applied = new Map((await client.query("select name, checksum from identity_migrations")).rows.map((r) => [r.name, r.checksum]));
    const done = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      const sql = readFileSync(path.join(dir, file), "utf8");
      const checksum = sha256(sql);
      const previous = applied.get(file);
      if (previous !== undefined) {
        if (previous !== checksum) throw new Error(`identity migration ${file} was changed after it was applied`);
        continue;
      }
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into identity_migrations (name, checksum) values ($1, $2)", [file, checksum]);
        await client.query("commit");
        done.push({ name: file, checksum });
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    return done;
  } finally {
    client.release();
  }
}

/**
 * F4.2.1: the one first-party client. The provider's API refuses `http` redirect URIs (spike item K3), so it is written straight into the client
 * table, idempotently. PKCE is mandatory, the redirect URI is exact, the client is public (no secret) and first-party (no consent screen).
 * @param {import("pg").Pool} pool
 * @param {string} redirectUri
 * @param {string} origin
 */
export async function registerAccountClient(pool, redirectUri, origin) {
  await registerFirstPartyClient(pool, ACCOUNT_CLIENT_ID, "Platterly Account", redirectUri, origin);
}

/** The Store is the second first-party client: same rules as the Account, its own client id and its own exact redirect address. */
export async function registerStoreClient(pool, redirectUri, origin) {
  await registerFirstPartyClient(pool, STORE_CLIENT_ID, "Platterly Store", redirectUri, origin);
}

async function registerFirstPartyClient(pool, clientId, name, redirectUri, origin) {
  await pool.query(
    `insert into "oauthClient" ("id", "clientId", "name", "redirectUris", "scopes", "skipConsent", "requirePKCE", "tokenEndpointAuthMethod", "grantTypes", "responseTypes", "applicationType", "disabled", "enableEndSession", "postLogoutRedirectUris", "subjectType", "createdAt", "updatedAt")
     values ($1, $1, $5, $2::jsonb, $3::jsonb, true, true, 'none', '["authorization_code"]'::jsonb, '["code"]'::jsonb, 'web', false, true, $4::jsonb, 'public', now(), now())
     on conflict ("clientId") do update set "redirectUris" = excluded."redirectUris", "scopes" = excluded."scopes", "skipConsent" = true, "requirePKCE" = true, "tokenEndpointAuthMethod" = 'none',
       "grantTypes" = excluded."grantTypes", "responseTypes" = excluded."responseTypes", "disabled" = false, "postLogoutRedirectUris" = excluded."postLogoutRedirectUris", "updatedAt" = now()`,
    [clientId, JSON.stringify([redirectUri]), JSON.stringify(ACCOUNT_SCOPES), JSON.stringify([`${origin}/`]), name],
  );
}
