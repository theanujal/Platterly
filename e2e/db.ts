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
    // Chunk 10 — same ordering hazard: `order`.customerId is onDelete:
    // Restrict, and Postgres gives no guarantee it resolves organization's
    // cascade into `order` before its cascade into `customer`. `order` is
    // also a reserved SQL keyword, hence the quoting.
    await pool.query('DELETE FROM "order" WHERE "organizationId" = ANY($1)', [orgIds]);
    // Chunk 10 Group 10.1 — same hazard again: quotation.customerId is also
    // onDelete: Restrict.
    await pool.query('DELETE FROM quotation WHERE "organizationId" = ANY($1)', [orgIds]);
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
  await pool.query('DELETE FROM "order" WHERE "organizationId" = $1', [org.id]);
  await pool.query('DELETE FROM quotation WHERE "organizationId" = $1', [org.id]);
  await pool.query('DELETE FROM audit_log WHERE "organizationId" = $1', [org.id]);
  await pool.query('DELETE FROM subscription WHERE "organizationId" = $1', [org.id]);
  await pool.query('DELETE FROM organization WHERE id = $1', [org.id]);
}

/**
 * Reads the plain-text OTP Better Auth's `emailOTP` plugin just wrote to its
 * own generic `verification` table (`identifier` = `"email-verification-otp-<email>"`,
 * `value` = `"<otp>:<attempts>"` — see `node_modules/better-auth/dist/
 * plugins/email-otp/utils.mjs`'s `toOTPIdentifier`/`index.mjs`'s
 * `createVerificationValue` call). Delivery is log-only for now (AJ's
 * explicit choice, 2026-09-16) — this is the only way an E2E test (or AJ,
 * manually) can get the code without a real inbox.
 */
export async function getLatestEmailOtp(email: string): Promise<string | null> {
  const { rows } = await pool.query<{ value: string }>(
    'SELECT value FROM verification WHERE identifier = $1 ORDER BY "createdAt" DESC LIMIT 1',
    [`email-verification-otp-${email}`],
  );
  const value = rows[0]?.value;
  if (!value) return null;
  return value.slice(0, value.lastIndexOf(":"));
}

export async function closeDbPool(): Promise<void> {
  await pool.end();
}

/**
 * Chunk 12 — pushes a tenant's unfinished storefront drafts back in time so
 * the "abandoned after 30 minutes idle" state can be exercised without
 * waiting half an hour. Prisma stores DateTime as UTC in `timestamp` (no
 * zone) columns, so "now" must be taken in UTC too — plain `now()` would use
 * the session's local zone and land hours in the future on an IST machine.
 */
export async function backdateStorefrontDrafts(slug: string, minutesAgo: number): Promise<void> {
  await pool.query(
    `UPDATE storefront_draft SET "lastActivityAt" = (now() AT TIME ZONE 'utc') - ($2 || ' minutes')::interval
     WHERE status = 'IN_PROGRESS' AND "organizationId" = (SELECT id FROM organization WHERE slug = $1)`,
    [slug, String(minutesAgo)],
  );
}

export interface CalendarFixtureOrder {
  /** "YYYY-MM-DD" */
  start: string;
  end: string;
  status?: "DRAFT" | "CONFIRMED" | "IN_PREPARATION" | "READY" | "COMPLETED" | "CANCELLED";
  guests?: number;
}

export interface CalendarFixtureEvent {
  name: string;
  start: string;
  end: string;
  /** Index into `orders` this Event belongs to; omit for a standalone Event. */
  orderIndex?: number;
}

/**
 * Chunk 13 — seeds a signed-up tenant with a Customer, an Event Type, and
 * the given Orders/Events by raw SQL (building this many orders through the
 * UI would dwarf what the calendar spec is actually checking). Dates are
 * stored as UTC midnight, exactly like the real app's `new Date("YYYY-MM-DD")`.
 * `cleanupOnboardingTestUser` already removes all of it.
 */
export async function seedCalendarFixtures(
  email: string,
  fixtures: { orders: CalendarFixtureOrder[]; events: CalendarFixtureEvent[] },
): Promise<void> {
  const { rows } = await pool.query<{ organizationId: string }>(
    `SELECT m."organizationId" FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1 LIMIT 1`,
    [email],
  );
  const orgId = rows[0]?.organizationId;
  if (!orgId) throw new Error(`No organization found for ${email}`);

  const customerId = crypto.randomUUID();
  const eventTypeId = crypto.randomUUID();
  await pool.query(`INSERT INTO customer (id, "organizationId", name, phone, "updatedAt") VALUES ($1, $2, 'Calendar Customer', '+919800000001', now())`, [customerId, orgId]);
  await pool.query(`INSERT INTO event_type (id, "organizationId", name, "updatedAt") VALUES ($1, $2, 'Calendar Wedding', now())`, [eventTypeId, orgId]);

  const orderIds: string[] = [];
  for (const o of fixtures.orders) {
    const id = crypto.randomUUID();
    orderIds.push(id);
    await pool.query(
      `INSERT INTO "order" (id, "organizationId", "customerId", "eventTypeId", "eventStartDate", "eventEndDate", status, "totalParticipants", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::timestamp, $6::timestamp, $7::"OrderStatus", $8, now())`,
      [id, orgId, customerId, eventTypeId, o.start, o.end, o.status ?? "CONFIRMED", o.guests ?? null],
    );
  }
  for (const e of fixtures.events) {
    await pool.query(
      `INSERT INTO event (id, "organizationId", "customerId", "eventTypeId", name, "startDate", "endDate", "orderId", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6::timestamp, $7::timestamp, $8, now())`,
      [crypto.randomUUID(), orgId, customerId, eventTypeId, e.name, e.start, e.end, e.orderIndex === undefined ? null : orderIds[e.orderIndex]],
    );
  }
}
