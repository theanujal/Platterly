// Registers a product as an OIDC client of the identity provider, with its redirect, post-logout and back-channel logout addresses and the
// name, logo and look the central sign-in pages show for it. Real product clients are created by the product registry (F6.1.1); this exists so a product can
// be exercised before that. Re-run it after changing anything below.
//   Local:      source ~/.platterly/f4dev/env.sh && node scripts/register-product-client.mjs stub|caterly
//   Production: IDENTITY_DATABASE_URL=<live identity db> CATERLY_ORIGIN=https://catering.platterly.in node scripts/register-product-client.mjs caterly --production
//   Check:      the same environment, with --check instead: prints the registered redirect and exits 1 unless it is exactly the one for CATERLY_ORIGIN (run it after
//               registering, and before the first catering release; without CATERLY_ORIGIN a production run is refused, never a localhost default)
import pg from "pg";

const PRESETS = {
  // The temporary stub product (apps/stub-product).
  stub: {
    clientId: "stub-product",
    name: "Platterly stub product",
    originEnv: "STUB_ORIGIN",
    defaultOrigin: "http://stub.localhost:3500",
    redirect: "/auth/callback",
    backchannel: "/api/platform/logout",
    icon: "/logo.svg",
    theme: null,
  },
  // Caterly (the catering app at the repository root). The redirect address is Better Auth's generic-oauth callback for the provider id "platterly".
  caterly: {
    clientId: "caterly",
    name: "Caterly",
    originEnv: "CATERLY_ORIGIN",
    defaultOrigin: "http://catering.localhost:3000",
    redirect: "/api/auth/callback/platterly",
    backchannel: "/api/platform/logout",
    icon: "/caterly-mark.png",
    theme: "caterly",
  },
};

const args = process.argv.slice(2);
const production = args.includes("--production");
const checkOnly = args.includes("--check");
const key = args.find((a) => !a.startsWith("--"));
const preset = PRESETS[key];
if (!preset) throw new Error(`usage: node scripts/register-product-client.mjs ${Object.keys(PRESETS).join("|")}`);
if (production && key === "stub") throw new Error("the stub product is never registered on a live database");
const url = process.env.IDENTITY_DATABASE_URL;
if (!url) throw new Error("IDENTITY_DATABASE_URL is not set");
const port = new URL(url).port || "5432";
if (!production && ["5432", "55432", "55433"].includes(port)) throw new Error(`refusing port ${port}: run this against the F4 cluster only (a live database needs --production)`);
// Production never falls back to the localhost default: a live sign-in registered with a localhost redirect would fail for everyone.
const origin = production || checkOnly ? process.env[preset.originEnv] : (process.env[preset.originEnv] ?? preset.defaultOrigin);
if (!origin) throw new Error(`${preset.originEnv} must be set (the product's public address, for example https://catering.platterly.in)`);
const host = new URL(origin).hostname;
if (production || checkOnly) {
  if (new URL(origin).protocol !== "https:" || host === "localhost" || host.endsWith(".localhost") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) throw new Error(`${preset.originEnv} must be the live https address, not ${origin}`);
} else if (!host.endsWith(".localhost")) throw new Error("a product client may only be registered here for a *.localhost address (use --production for a live one)");

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  if (checkOnly) {
    const { rows } = await pool.query(`select "redirectUris", "postLogoutRedirectUris", "backchannelLogoutUri", "disabled" from "oauthClient" where "clientId" = $1`, [preset.clientId]);
    const wanted = `${origin}${preset.redirect}`;
    const row = rows[0];
    const uris = row ? (typeof row.redirectUris === "string" ? JSON.parse(row.redirectUris) : row.redirectUris) : [];
    console.log(`${preset.clientId}: ${row ? `redirect ${JSON.stringify(uris)}, back-channel ${row.backchannelLogoutUri}, disabled ${row.disabled}` : "not registered"}`);
    if (!row || row.disabled || uris.length !== 1 || uris[0] !== wanted || row.backchannelLogoutUri !== `${origin}${preset.backchannel}`) {
      console.error(`FAIL: expected exactly ${wanted} (and back-channel ${origin}${preset.backchannel}), enabled`);
      process.exitCode = 1;
    } else console.log("OK: the live redirect is registered");
  } else {
  await pool.query(
    `insert into "oauthClient" ("id", "clientId", "name", "redirectUris", "scopes", "skipConsent", "requirePKCE", "tokenEndpointAuthMethod", "grantTypes", "responseTypes", "applicationType", "disabled", "enableEndSession", "postLogoutRedirectUris", "backchannelLogoutUri", "icon", "metadata", "subjectType", "createdAt", "updatedAt")
     values ($1, $1, $2, $3::jsonb, '["openid","email","profile"]'::jsonb, true, true, 'none', '["authorization_code"]'::jsonb, '["code"]'::jsonb, 'web', false, true, $4::jsonb, $5, $6, $7::jsonb, 'public', now(), now())
     on conflict ("clientId") do update set "name" = excluded."name", "redirectUris" = excluded."redirectUris", "postLogoutRedirectUris" = excluded."postLogoutRedirectUris",
       "backchannelLogoutUri" = excluded."backchannelLogoutUri", "icon" = excluded."icon", "metadata" = excluded."metadata",
       "skipConsent" = true, "requirePKCE" = true, "tokenEndpointAuthMethod" = 'none', "disabled" = false, "enableEndSession" = true, "updatedAt" = now()`,
    [preset.clientId, preset.name, JSON.stringify([`${origin}${preset.redirect}`]), JSON.stringify([`${origin}/`]), `${origin}${preset.backchannel}`, `${origin}${preset.icon}`, preset.theme ? JSON.stringify({ theme: preset.theme }) : null],
  );
  console.log(`${preset.clientId} registered for ${origin} (redirect, post-logout, back-channel logout, name, logo${preset.theme ? `, theme ${preset.theme}` : ""})`);
  }
} finally {
  await pool.end();
}
