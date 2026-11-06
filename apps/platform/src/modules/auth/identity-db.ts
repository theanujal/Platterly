import "server-only";
import path from "node:path";
import { Pool } from "pg";

// The identity database (Better Auth's own tables: user, session, account, verification, jwks, OAuth client, tokens and consents). It is a
// SEPARATE database from the Platform database, as the approved recovery rules assume (restoring it invalidates every provider session). Its
// connection string is IDENTITY_DATABASE_URL; there is no fallback to DATABASE_URL, so Platform data and credentials can never share a database.
declare global {
  var __identityPool: Pool | undefined;
}

export function identityPool(): Pool {
  const url = process.env.IDENTITY_DATABASE_URL;
  if (!url) throw new Error("IDENTITY_DATABASE_URL is not set");
  if (!globalThis.__identityPool) globalThis.__identityPool = new Pool({ connectionString: url, max: 10 });
  return globalThis.__identityPool;
}

export { migrateIdentity } from "./identity-migrate.mjs";

export const IDENTITY_MIGRATIONS_DIR = path.resolve(process.cwd(), "identity/migrations");
