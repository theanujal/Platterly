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
    // Chunk 9 — `event` cascades its own `event_required_inventory` rows,
    // but Postgres gives no ordering guarantee between sibling cascade
    // paths off `organization` (event->event_required_inventory vs.
    // organization->inventory directly) within one DELETE's cascade
    // execution — deleting `event` explicitly first, before `organization`,
    // avoids `event_required_inventory`'s onDelete: Restrict on inventoryId
    // ever firing against a row that's about to cascade away anyway.
    await pool.query('DELETE FROM event WHERE "organizationId" = ANY($1)', [orgIds]);
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

/**
 * Chunk 5 — for an invited teammate, who joins the INVITER's existing
 * organization rather than getting their own. Removing only the user's own
 * rows (never the shared organization) leaves that org's cleanup to the
 * inviting owner's own `cleanupOnboardingTestUser` call.
 */
export async function cleanupInviteeUser(email: string): Promise<void> {
  const { rows: userRows } = await pool.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [email]);
  const user = userRows[0];
  if (!user) return;

  await pool.query('DELETE FROM member WHERE "userId" = $1', [user.id]);
  await pool.query('DELETE FROM session WHERE "userId" = $1', [user.id]);
  await pool.query('DELETE FROM account WHERE "userId" = $1', [user.id]);
  await pool.query('DELETE FROM "user" WHERE id = $1', [user.id]);
}

export async function getPendingInvitationId(email: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM invitation WHERE email = $1 AND status = \'pending\' ORDER BY "createdAt" DESC LIMIT 1',
    [email],
  );
  return rows[0]?.id ?? null;
}

export async function getOrganizationNameForUser(email: string): Promise<string | null> {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT o.name FROM organization o
     JOIN member m ON m."organizationId" = o.id
     JOIN "user" u ON u.id = m."userId"
     WHERE u.email = $1
     LIMIT 1`,
    [email],
  );
  return rows[0]?.name ?? null;
}

/**
 * Chunk 6 correction round — for tenants created directly via Super Admin's
 * `/super/tenants/new` form (no signup, no User/Member row involved, unlike
 * `cleanupOnboardingTestUser`).
 */
export async function cleanupTenantBySlug(slug: string): Promise<void> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM organization WHERE slug = $1', [slug]);
  const org = rows[0];
  if (!org) return;
  await pool.query('DELETE FROM event WHERE "organizationId" = $1', [org.id]); // see cleanupOnboardingTestUser's comment
  await pool.query('DELETE FROM audit_log WHERE "organizationId" = $1', [org.id]);
  await pool.query('DELETE FROM subscription WHERE "organizationId" = $1', [org.id]);
  await pool.query('DELETE FROM organization WHERE id = $1', [org.id]);
}

export async function closeDbPool(): Promise<void> {
  await pool.end();
}
