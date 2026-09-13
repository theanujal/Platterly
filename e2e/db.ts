import "dotenv/config";
import { Pool } from "pg";

/**
 * Chunk 4 — Playwright's default TS loader compiles everything as CommonJS
 * (no "type": "module" in package.json), but the generated Prisma client
 * (`src/generated/prisma/client.ts`) is ESM-only (`import.meta`). Vitest
 * sidesteps this via Vite's native-ESM transform; Playwright's loader has no
 * equivalent, and flipping the whole project to `"type": "module"` would
 * touch Next.js/ESLint/Prisma config far beyond this test file's scope. So
 * E2E specs talk to Postgres directly via `pg` (already a project
 * dependency) instead of importing `@/lib/db`.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function cleanupOnboardingTestUser(email: string): Promise<void> {
  const { rows: userRows } = await pool.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [email]);
  const user = userRows[0];
  if (!user) return;

  const { rows: memberRows } = await pool.query<{ organizationId: string }>(
    'SELECT "organizationId" FROM member WHERE "userId" = $1',
    [user.id],
  );
  const orgIds = memberRows.map((row) => row.organizationId);
  if (orgIds.length > 0) {
    await pool.query('DELETE FROM audit_log WHERE "organizationId" = ANY($1)', [orgIds]);
    await pool.query('DELETE FROM subscription WHERE "organizationId" = ANY($1)', [orgIds]);
    await pool.query('DELETE FROM member WHERE "organizationId" = ANY($1)', [orgIds]);
    await pool.query('DELETE FROM organization WHERE id = ANY($1)', [orgIds]);
  }
  await pool.query('DELETE FROM session WHERE "userId" = $1', [user.id]);
  await pool.query('DELETE FROM account WHERE "userId" = $1', [user.id]);
  await pool.query('DELETE FROM "user" WHERE id = $1', [user.id]);
}

export async function getTrialSubscriptionStatus(email: string): Promise<string | null> {
  const { rows: userRows } = await pool.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [email]);
  const user = userRows[0];
  if (!user) return null;

  const { rows: memberRows } = await pool.query<{ organizationId: string }>(
    'SELECT "organizationId" FROM member WHERE "userId" = $1',
    [user.id],
  );
  const orgId = memberRows[0]?.organizationId;
  if (!orgId) return null;

  const { rows: subRows } = await pool.query<{ status: string }>(
    'SELECT status FROM subscription WHERE "organizationId" = $1',
    [orgId],
  );
  return subRows[0]?.status ?? null;
}

export async function closeDbPool(): Promise<void> {
  await pool.end();
}
