// Applies identity/migrations to the identity database and registers the first-party Account client.
//   IDENTITY_DATABASE_URL=... ROOT_DOMAIN=localhost:3300 node scripts/identity-migrate.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { migrateIdentity, registerAccountClient, registerStoreClient } from "../src/modules/auth/identity-migrate.mjs";

const url = process.env.IDENTITY_DATABASE_URL;
if (!url) throw new Error("IDENTITY_DATABASE_URL is not set");
const root = process.env.ROOT_DOMAIN ?? "localhost:3300";
const scheme = root.startsWith("localhost") ? "http" : "https";
const origin = `${scheme}://account.${root}`;
const storeOrigin = `${scheme}://store.${root}`;
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../identity/migrations");

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const applied = await migrateIdentity(pool, dir);
  await registerAccountClient(pool, `${origin}/auth/callback`, origin);
  await registerStoreClient(pool, `${storeOrigin}/auth/callback`, storeOrigin);
  console.log(`identity migrations applied: ${applied.length ? applied.map((a) => a.name).join(", ") : "none (up to date)"}; clients registered for ${origin} and ${storeOrigin}`);
} finally {
  await pool.end();
}
