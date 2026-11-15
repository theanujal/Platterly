// DEV ONLY: registers a product as an OIDC client of the local identity provider, with its redirect, post-logout and back-channel logout addresses and the
// name, logo and look the central sign-in pages show for it. Real product clients are created by the product registry (F6.1.1); this exists so a product can
// be exercised before that. Re-run it after changing anything below.
//   source ~/.platterly/f4dev/env.sh && node scripts/register-product-client.mjs stub|caterly
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

const key = process.argv[2];
const preset = PRESETS[key];
if (!preset) throw new Error(`usage: node scripts/register-product-client.mjs ${Object.keys(PRESETS).join("|")}`);
const url = process.env.IDENTITY_DATABASE_URL;
if (!url) throw new Error("IDENTITY_DATABASE_URL is not set");
const port = new URL(url).port || "5432";
if (["5432", "55432", "55433"].includes(port)) throw new Error(`refusing port ${port}: run this against the F4 cluster only`);
const origin = process.env[preset.originEnv] ?? preset.defaultOrigin;
if (!new URL(origin).hostname.endsWith(".localhost")) throw new Error("a product client may only be registered here for a *.localhost address");

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await pool.query(
    `insert into "oauthClient" ("id", "clientId", "name", "redirectUris", "scopes", "skipConsent", "requirePKCE", "tokenEndpointAuthMethod", "grantTypes", "responseTypes", "applicationType", "disabled", "enableEndSession", "postLogoutRedirectUris", "backchannelLogoutUri", "icon", "metadata", "subjectType", "createdAt", "updatedAt")
     values ($1, $1, $2, $3::jsonb, '["openid","email","profile"]'::jsonb, true, true, 'none', '["authorization_code"]'::jsonb, '["code"]'::jsonb, 'web', false, true, $4::jsonb, $5, $6, $7::jsonb, 'public', now(), now())
     on conflict ("clientId") do update set "name" = excluded."name", "redirectUris" = excluded."redirectUris", "postLogoutRedirectUris" = excluded."postLogoutRedirectUris",
       "backchannelLogoutUri" = excluded."backchannelLogoutUri", "icon" = excluded."icon", "metadata" = excluded."metadata",
       "skipConsent" = true, "requirePKCE" = true, "tokenEndpointAuthMethod" = 'none', "disabled" = false, "enableEndSession" = true, "updatedAt" = now()`,
    [preset.clientId, preset.name, JSON.stringify([`${origin}${preset.redirect}`]), JSON.stringify([`${origin}/`]), `${origin}${preset.backchannel}`, `${origin}${preset.icon}`, preset.theme ? JSON.stringify({ theme: preset.theme }) : null],
  );
  console.log(`${preset.clientId} registered for ${origin} (redirect, post-logout, back-channel logout, name, logo${preset.theme ? `, theme ${preset.theme}` : ""})`);
} finally {
  await pool.end();
}
