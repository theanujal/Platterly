import "dotenv/config";
import { Pool } from "pg";
import { DEFAULT_TIME_ZONE } from "../src/lib/time/timezone";

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
    // Chunk 18 — recipe_ingredient is onDelete: Restrict to inventory; same hazard.
    // Chunk 18.3 — purchase orders and supplier payments are onDelete: Restrict to supplier / inventory.
    await pool.query('DELETE FROM staff_assignment WHERE "organizationId" = ANY($1)', [orgIds]);
    await pool.query('DELETE FROM purchase_order WHERE "organizationId" = ANY($1)', [orgIds]);
    await pool.query('DELETE FROM supplier_payment WHERE "organizationId" = ANY($1)', [orgIds]);
    await pool.query('DELETE FROM recipe WHERE "organizationId" = ANY($1)', [orgIds]);
    await pool.query('DELETE FROM event WHERE "organizationId" = ANY($1)', [orgIds]);
    // Chunk 10 — same ordering hazard: `order`.customerId is onDelete:
    // Restrict, and Postgres gives no guarantee it resolves organization's
    // cascade into `order` before its cascade into `customer`. `order` is
    // also a reserved SQL keyword, hence the quoting.
    // Chunk 14 — payment, invoice and payment_link are onDelete: Restrict to `order`.
    await pool.query('DELETE FROM payment WHERE "organizationId" = ANY($1)', [orgIds]);
    await pool.query('DELETE FROM invoice WHERE "organizationId" = ANY($1)', [orgIds]);
    await pool.query('DELETE FROM payment_link WHERE "organizationId" = ANY($1)', [orgIds]);
    await pool.query('DELETE FROM "order" WHERE "organizationId" = ANY($1)', [orgIds]);
    // Chunk 10 Group 10.1 — same hazard again: quotation.customerId is also
    // onDelete: Restrict.
    await pool.query('DELETE FROM quotation WHERE "organizationId" = ANY($1)', [orgIds]);
    await pool.query('DELETE FROM audit_log WHERE "organizationId" = ANY($1)', [orgIds]);
    await pool.query('DELETE FROM subscription_payment WHERE "organizationId" = ANY($1)', [orgIds]);
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

/** Sets a signed-up member's role directly (the invite UI only offers the role presets one at a time). */
export async function setMemberRole(email: string, role: string): Promise<void> {
  await pool.query('UPDATE member SET role = $1 WHERE "userId" = (SELECT id FROM "user" WHERE email = $2)', [role, email]);
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
  await pool.query('DELETE FROM payment WHERE "organizationId" = $1', [org.id]);
  await pool.query('DELETE FROM invoice WHERE "organizationId" = $1', [org.id]);
  await pool.query('DELETE FROM payment_link WHERE "organizationId" = $1', [org.id]);
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

/** The latest 6-digit "forgot password" code for an address (stored by better-auth under its own identifier). */
export async function getLatestResetOtp(email: string): Promise<string | null> {
  const { rows } = await pool.query<{ value: string }>(
    'SELECT value FROM verification WHERE identifier = $1 ORDER BY "createdAt" DESC LIMIT 1',
    [`forget-password-otp-${email}`],
  );
  const value = rows[0]?.value;
  return value ? value.slice(0, value.lastIndexOf(":")) : null;
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
  status?: "PENDING_REVIEW" | "AWAITING_CUSTOMER_APPROVAL" | "APPROVED" | "SENT_TO_KITCHEN" | "COMPLETED" | "CANCELLED";
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
      [id, orgId, customerId, eventTypeId, o.start, o.end, o.status ?? "APPROVED", o.guests ?? null],
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

/**
 * Stands in for the Platterly admin dashboard (not built yet), which is what
 * connects a caterer's WhatsApp/Email provider: marks the channel's provider connected.
 */
export async function connectNotificationProvider(email: string, channel: "whatsapp" | "email", connected = true): Promise<void> {
  const { rows } = await pool.query<{ organizationId: string }>(
    `SELECT m."organizationId" FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1 LIMIT 1`,
    [email],
  );
  const orgId = rows[0]?.organizationId;
  if (!orgId) throw new Error(`No organization found for ${email}`);
  await pool.query(
    `INSERT INTO tenant_setting (id, "organizationId", key, value, "updatedAt") VALUES ($1, $2, $3, $4::jsonb, now())
     ON CONFLICT ("organizationId", key) DO UPDATE SET value = $4::jsonb, "updatedAt" = now()`,
    [crypto.randomUUID(), orgId, `notifications.${channel}.provider`, JSON.stringify({ connected })],
  );
}


/**
 * Chunk 16.3: sets where a person is in the "Stay updated" push popup schedule. Specs mark it NEVER so the popup
 * doesn't sit over the page they are testing; push-prompt.spec.ts resets it to PENDING to test the popup itself.
 */
export async function setPushPromptState(email: string, state: "PENDING" | "LATER" | "ENABLED" | "NEVER" | "EXHAUSTED", nextAtMinutesFromNow?: number): Promise<void> {
  await pool.query(
    `UPDATE "user" SET "pushPromptState" = $2::"PushPromptState", "pushPromptCount" = 0,
       "pushPromptNextAt" = CASE WHEN $3::int IS NULL THEN NULL ELSE (now() AT TIME ZONE 'UTC') + ($3::int * interval '1 minute') END WHERE email = $1`,
    [email, state, nextAtMinutesFromNow ?? null],
  );
}

export async function getPushPrompt(email: string): Promise<{ state: string; count: number; daysUntilNext: number | null }> {
  // Prisma stores UTC in a zone-less column, so compare against UTC "now" rather than the session's local time.
  const { rows } = await pool.query<{ pushPromptState: string; pushPromptCount: number; days: string | null }>(
    `SELECT "pushPromptState", "pushPromptCount", EXTRACT(EPOCH FROM ("pushPromptNextAt" - (now() AT TIME ZONE 'UTC'))) / 86400 AS days FROM "user" WHERE email = $1`,
    [email],
  );
  return { state: rows[0].pushPromptState, count: rows[0].pushPromptCount, daysUntilNext: rows[0].days === null ? null : Number(rows[0].days) };
}

/** Chunk 16.5: puts an in-app notification in a signed-up caterer's bell, the way a real trigger would. */
export async function addInAppNotification(email: string, title: string, message: string): Promise<void> {
  const { rows } = await pool.query<{ organizationId: string; userId: string }>(
    `SELECT m."organizationId", m."userId" FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1 LIMIT 1`,
    [email],
  );
  if (!rows[0]) throw new Error(`No organization found for ${email}`);
  await pool.query(
    `INSERT INTO notification (id, "organizationId", channel, event, "recipientUserId", payload, "createdAt") VALUES ($1, $2, 'IN_APP', 'order.new_alert', $3, $4, now())`,
    [crypto.randomUUID(), rows[0].organizationId, rows[0].userId, JSON.stringify({ title, message })],
  );
}

/**
 * Chunk 14 — a bare-bones customer + order for the billing specs, inserted directly: the order form itself is
 * covered by orders.spec.ts, and billing only needs an order with a total. Returns the ids the spec needs.
 */
export async function seedOrderForBilling(email: string, total: number): Promise<{ orderId: string; organizationId: string; orderNumber: string }> {
  const { rows: members } = await pool.query<{ organizationId: string }>(
    'SELECT m."organizationId" FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1 LIMIT 1',
    [email],
  );
  const organizationId = members[0]?.organizationId;
  if (!organizationId) throw new Error(`No organization for ${email}`);
  const suffix = Math.random().toString(36).slice(2, 10);
  const customerId = `cust_${suffix}`;
  const orderId = `ord_${suffix}`;
  const orderNumber = `ORD-${Math.floor(1000 + Math.random() * 8999)}`;
  await pool.query('INSERT INTO customer (id, "organizationId", name, phone, email, "updatedAt") VALUES ($1, $2, $3, $4, $5, now())', [customerId, organizationId, "Billing Customer", `+9198765${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`, "billing-customer@example.test"]);
  await pool.query(
    `INSERT INTO "order" (id, "organizationId", "customerId", "orderNumber", "eventStartDate", "eventEndDate", "totalParticipants", "adultCount", "individualPricingEnabled", subtotal, total, balance, venue, "updatedAt")
     VALUES ($1, $2, $3, $4, now() + interval '10 days', now() + interval '10 days', 100, 100, true, $5, $5, $5, 'Whitefield Hall', now())`,
    [orderId, organizationId, customerId, orderNumber, total],
  );
  await pool.query(
    `INSERT INTO meal_plan_entry (id, "orderId", date, "mealType", price) VALUES ($1, $2, now() + interval '10 days', 'DINNER', $3)`,
    // Individual Pricing is a per-plate price (AJ, 2026-10-10): 100 adults at total / 100 each make the order total.
    [`mpe_${suffix}`, orderId, total / 100],
  );
  return { orderId, organizationId, orderNumber };
}

/**
 * Share order spec: an order whose menu the customer has already approved and whose venue form is in, so the customer's
 * link opens straight on the Confirmation page. Returns the approval link's token and the order id. The kitchen gets a
 * phone number so the shared page has something to show. Event 3 days away.
 */
export async function seedApprovedOrderForShare(
  email: string,
  options: { stage?: "CONFIRMATION" | "VENUE" | "REVIEW"; kidsBelow5?: number; kids5To10?: number } = {},
): Promise<{ approvalToken: string; orderId: string }> {
  const kidsBelow5 = options.kidsBelow5 ?? 0;
  const kids5To10 = options.kids5To10 ?? 0;
  // "VENUE": approved but the venue details are not in yet, so the link opens on the Venue & Delivery form.
  // "REVIEW": the menu is out with the customer again (a new version after changes) and the order still carries the venue
  // details timestamp of the earlier round, which is what once made the second round fail.
  const stage = options.stage ?? "CONFIRMATION";
  const venueSubmitted = stage === "CONFIRMATION" || stage === "REVIEW";
  const selectionStatus = stage === "REVIEW" ? "SENT_TO_CUSTOMER" : "CUSTOMER_APPROVED";
  const orderStatus = stage === "REVIEW" ? "AWAITING_CUSTOMER_APPROVAL" : "APPROVED";
  const { rows: members } = await pool.query<{ organizationId: string }>('SELECT m."organizationId" FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1 LIMIT 1', [email]);
  const organizationId = members[0]?.organizationId;
  if (!organizationId) throw new Error(`No organization for ${email}`);
  const suffix = Math.random().toString(36).slice(2, 10);
  const orderId = `ord_${suffix}`;
  const eventId = `ev_${suffix}`;
  const selectionId = `ms_${suffix}`;
  const versionId = `mv_${suffix}`;
  const approvalToken = `tok_${suffix}_${Math.random().toString(36).slice(2, 12)}`;
  await pool.query('UPDATE organization SET "contactPhone" = $2 WHERE id = $1', [organizationId, "+919800011122"]);
  await pool.query('INSERT INTO customer (id, "organizationId", name, phone, email, "updatedAt") VALUES ($1, $2, $3, $4, $5, now())', [`cust_${suffix}`, organizationId, "Share Customer", "+919811122233", "share-customer@example.test"]);
  await pool.query('INSERT INTO event_type (id, "organizationId", name, "updatedAt") VALUES ($1, $2, $3, now())', [`et_${suffix}`, organizationId, "Wedding"]);
  await pool.query(
    `INSERT INTO "order" (id, "organizationId", "customerId", "eventTypeId", "orderNumber", status, "eventStartDate", "eventEndDate", "totalParticipants", "adultCount", "childBelow5Count", "child5To10Count", subtotal, total, balance, venue, "eventAddress", "venueDetailsSubmittedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, '${orderStatus}', date_trunc('day', now() at time zone 'UTC') + interval '3 days', date_trunc('day', now() at time zone 'UTC') + interval '3 days', $6, 100, $7, $8, 1000, 1000, 1000, 'Grand Hall', '12 MG Road', ${venueSubmitted ? "now()" : "NULL"}, (now() at time zone 'UTC'), now())`,
    [orderId, organizationId, `cust_${suffix}`, `et_${suffix}`, `ORD-${Math.floor(1000 + Math.random() * 8999)}`, 100 + kidsBelow5 + kids5To10, kidsBelow5, kids5To10],
  );
  await pool.query(
    `INSERT INTO event (id, "organizationId", "customerId", "eventTypeId", "orderId", name, "startDate", "endDate", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, 'Share Customer Wedding', now() + interval '3 days', now() + interval '3 days', now())`,
    [eventId, organizationId, `cust_${suffix}`, `et_${suffix}`, orderId],
  );
  await pool.query(`INSERT INTO menu_selection (id, "organizationId", "eventId", status, "currentVersion", "updatedAt") VALUES ($1, $2, $3, '${selectionStatus}', 1, now())`, [selectionId, organizationId, eventId]);
  const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const snapshot = {
    customerName: "Share Customer",
    eventTypeName: "Wedding",
    eventStartDate: day,
    eventEndDate: day,
    venue: "Grand Hall",
    guests: 100 + kidsBelow5 + kids5To10,
    childBelow5Count: kidsBelow5,
    child5To10Count: kids5To10,
    total: 1000,
    meals: [
      {
        date: day,
        mealType: "DINNER",
        menuName: "Royal Dinner",
        pricePerPlate: 400,
        items: [
          { name: "Paneer Tikka", quantity: 1, itemType: "MENU_ITEM", unitPrice: 150, category: "Starters" },
          { name: "Dal Makhani", quantity: 1, itemType: "MENU_ITEM", unitPrice: 120, category: "Mains" },
          { name: "Chaat Counter", quantity: 1, itemType: "ADD_ON", unitPrice: 2000, addOnType: "LIVE_COUNTER", priceType: "FIXED" },
        ],
      },
    ],
    selectedItems: [],
    isCustomMenu: false,
  };
  await pool.query(`INSERT INTO menu_version (id, "menuSelectionId", "versionNumber", status, snapshot, "sentAt") VALUES ($1, $2, 1, '${selectionStatus}', $3, now())`, [versionId, selectionId, JSON.stringify(snapshot)]);
  await pool.query(`INSERT INTO secure_access_token (id, "organizationId", "resourceType", "resourceId", token) VALUES ($1, $2, 'MENU_APPROVAL', $3, $4)`, [`sat_${suffix}`, organizationId, versionId, approvalToken]);
  return { approvalToken, orderId };
}

/** Public multi-meal spec: each meal-plan entry of the kitchen's (only) order, with the menu it is on and its per-plate price. */
export async function getOrderMealMenus(slug: string): Promise<{ mealType: string; menuName: string | null; price: number; orderKind: string }[]> {
  const { rows } = await pool.query(
    `SELECT e."mealType", m.name AS "menuName", e.price, o."orderKind"
     FROM meal_plan_entry e JOIN "order" o ON o.id = e."orderId" JOIN organization org ON org.id = o."organizationId" LEFT JOIN menu m ON m.id = e."menuId"
     WHERE org.slug = $1 ORDER BY e."mealType"`,
    [slug],
  );
  return rows.map((r) => ({ mealType: r.mealType, menuName: r.menuName, price: Number(r.price), orderKind: r.orderKind }));
}

/** Payment grace spec: puts the user's kitchen on a paid (ACTIVE) plan whose period ended `daysAgo` days ago. */
export async function setPaidPeriodEnded(email: string, daysAgo: number): Promise<void> {
  await pool.query(
    `UPDATE subscription SET status = 'ACTIVE', "trialEndsAt" = NULL, "currentPeriodEnd" = (now() at time zone 'UTC') - make_interval(days => $2)
     WHERE "organizationId" = (SELECT m."organizationId" FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1 LIMIT 1) AND "endDate" IS NULL`,
    [email, daysAgo],
  );
}

/** Adds `count` plain customers to the user's business, for the list paging spec. */
export async function seedCustomers(email: string, count: number, from = 1): Promise<void> {
  const { rows } = await pool.query<{ organizationId: string }>('SELECT m."organizationId" FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1 LIMIT 1', [email]);
  const organizationId = rows[0]?.organizationId;
  if (!organizationId) throw new Error(`No organization for ${email}`);
  for (let i = from; i < from + count; i++) {
    await pool.query('INSERT INTO customer (id, "organizationId", name, phone, "updatedAt") VALUES ($1, $2, $3, $4, now())', [`cust_pg_${Date.now()}_${i}`, organizationId, `Paging Customer ${String(i).padStart(2, "0")}`, `+9197000${String(i).padStart(5, "0")}`]);
  }
}

/** Moves an order's event `daysAgo` days into the past (and optionally cancels it), for the Overdue payment specs. */
export async function setOrderEventPast(orderId: string, daysAgo: number, status?: "CANCELLED" | "COMPLETED"): Promise<void> {
  await pool.query(
    // "Today" is the business's day (India time), not UTC: the app counts overdue days from the business's own midnight, and
    // between 00:00 and 05:30 IST the two dates differ, which made "3 days ago" read as 4 days overdue.
    `UPDATE "order" SET "eventStartDate" = date_trunc('day', now() at time zone $3) - make_interval(days => $2), "eventEndDate" = date_trunc('day', now() at time zone $3) - make_interval(days => $2)${status ? `, status = '${status}'` : ""} WHERE id = $1`,
    [orderId, daysAgo, DEFAULT_TIME_ZONE],
  );
}

/**
 * Chunk 18.4 — an order that is already with the kitchen (Sent to Kitchen), 100 guests today, with one meal that has
 * the named Food Item on it. Inserted directly: the order form and the approval flow have their own specs.
 */
export async function seedKitchenOrderWithDish(email: string, dishName: string): Promise<{ orderId: string; orderNumber: string }> {
  const { rows: members } = await pool.query<{ organizationId: string }>(
    'SELECT m."organizationId" FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1 LIMIT 1',
    [email],
  );
  const organizationId = members[0]?.organizationId;
  if (!organizationId) throw new Error(`No organization for ${email}`);
  const { rows: dishes } = await pool.query<{ id: string }>('SELECT id FROM menu_item WHERE "organizationId" = $1 AND name = $2', [organizationId, dishName]);
  if (!dishes[0]) throw new Error(`No food item called ${dishName}`);
  const suffix = Math.random().toString(36).slice(2, 10);
  const customerId = `cust_${suffix}`;
  const orderId = `ord_${suffix}`;
  const orderNumber = `ORD-${Math.floor(1000 + Math.random() * 8999)}`;
  await pool.query('INSERT INTO customer (id, "organizationId", name, phone, "updatedAt") VALUES ($1, $2, $3, $4, now())', [customerId, organizationId, "Kitchen Customer", `+9198111${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`]);
  await pool.query(
    `INSERT INTO "order" (id, "organizationId", "customerId", "orderNumber", status, "eventStartDate", "eventEndDate", "totalParticipants", "adultCount", subtotal, total, balance, "updatedAt")
     VALUES ($1, $2, $3, $4, 'SENT_TO_KITCHEN', now(), now(), 100, 100, 1000, 1000, 1000, now())`,
    [orderId, organizationId, customerId, orderNumber],
  );
  await pool.query(`INSERT INTO meal_plan_entry (id, "orderId", date, "mealType") VALUES ($1, $2, now(), 'LUNCH')`, [`mpe_${suffix}`, orderId]);
  await pool.query(
    `INSERT INTO order_item (id, "orderId", "itemType", "menuItemId", "mealPlanEntryId", name, "unitPrice", quantity) VALUES ($1, $2, 'MENU_ITEM', $3, $4, $5, 100, 1)`,
    [`oi_${suffix}`, orderId, dishes[0].id, `mpe_${suffix}`, dishName],
  );
  return { orderId, orderNumber };
}

/** Chunk 19.2 — an order with its event (3 days away, 100 guests), for the staffing spec. */
export async function seedOrderWithEvent(email: string): Promise<{ orderId: string; orderNumber: string }> {
  const { rows: members } = await pool.query<{ organizationId: string }>(
    'SELECT m."organizationId" FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1 LIMIT 1',
    [email],
  );
  const organizationId = members[0]?.organizationId;
  if (!organizationId) throw new Error(`No organization for ${email}`);
  const suffix = Math.random().toString(36).slice(2, 10);
  const orderId = `ord_${suffix}`;
  const orderNumber = `ORD-${Math.floor(1000 + Math.random() * 8999)}`;
  await pool.query('INSERT INTO customer (id, "organizationId", name, phone, "updatedAt") VALUES ($1, $2, $3, $4, now())', [`cust_${suffix}`, organizationId, "Staffing Customer", `+9198222${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`]);
  await pool.query('INSERT INTO event_type (id, "organizationId", name, "updatedAt") VALUES ($1, $2, $3, now())', [`et_${suffix}`, organizationId, "Wedding"]);
  await pool.query(
    `INSERT INTO "order" (id, "organizationId", "customerId", "eventTypeId", "orderNumber", status, "eventStartDate", "eventEndDate", "totalParticipants", "adultCount", subtotal, total, balance, "updatedAt")
     VALUES ($1, $2, $3, $4, $5, 'APPROVED', now() + interval '3 days', now() + interval '3 days', 100, 100, 1000, 1000, 1000, now())`,
    [orderId, organizationId, `cust_${suffix}`, `et_${suffix}`, orderNumber],
  );
  await pool.query(
    `INSERT INTO event (id, "organizationId", "customerId", "eventTypeId", name, "startDate", "endDate", "guestCount", "orderId", "updatedAt")
     VALUES ($1, $2, $3, $4, 'Wedding', now() + interval '3 days', now() + interval '3 days', 100, $5, now())`,
    [`ev_${suffix}`, organizationId, `cust_${suffix}`, `et_${suffix}`, orderId],
  );
  return { orderId, orderNumber };
}

/** Chunk 23: puts an order's event at a named location. */
export async function assignOrderEventToLocation(orderId: string, locationName: string): Promise<void> {
  await pool.query(
    `UPDATE event SET "assignedKitchenId" = (SELECT k.id FROM kitchen k WHERE k.name = $2 AND k."organizationId" = event."organizationId") WHERE "orderId" = $1`,
    [orderId, locationName],
  );
}

/** Chunk 23: a draft purchase order for a named location (null = not tied to one). */
export async function seedPurchaseOrder(email: string, locationName: string | null): Promise<string> {
  const { rows } = await pool.query<{ organizationId: string }>('SELECT m."organizationId" FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1 LIMIT 1', [email]);
  const organizationId = rows[0]?.organizationId;
  if (!organizationId) throw new Error(`No organization for ${email}`);
  const suffix = Math.random().toString(36).slice(2, 10);
  await pool.query('INSERT INTO supplier (id, "organizationId", name, "updatedAt") VALUES ($1, $2, $3, now())', [`sup_${suffix}`, organizationId, `Supplier ${suffix}`]);
  await pool.query('INSERT INTO inventory (id, "organizationId", name, category, unit, "updatedAt") VALUES ($1, $2, $3, $4, $5, now())', [`inv_${suffix}`, organizationId, `Item ${suffix}`, "Grains", "kg"]);
  await pool.query(
    `INSERT INTO purchase_order (id, "organizationId", number, "supplierId", "kitchenId", "updatedAt")
     VALUES ($1, $2, $3, $4, (SELECT k.id FROM kitchen k WHERE k.name = $5 AND k."organizationId" = $2), now())`,
    [`po_${suffix}`, organizationId, `PO-${suffix}`, `sup_${suffix}`, locationName],
  );
  await pool.query('INSERT INTO purchase_order_item (id, "purchaseOrderId", "inventoryId", quantity, "unitCost") VALUES ($1, $2, $3, 5, 40)', [`poi_${suffix}`, `po_${suffix}`, `inv_${suffix}`]);
  return `po_${suffix}`;
}

/** Chunk 23: makes the signed-up person a manager held to a named location (the owner cannot be held). */
export async function holdMemberToLocation(email: string, locationName: string): Promise<void> {
  await pool.query(
    `UPDATE member SET role = 'manager', "locationId" = (SELECT k.id FROM kitchen k WHERE k.name = $2 AND k."organizationId" = member."organizationId")
     WHERE "userId" = (SELECT id FROM "user" WHERE email = $1)`,
    [email, locationName],
  );
}

/** A PENDING Razorpay payment, as `startRazorpayCheckout` records it before the customer pays. */
export async function seedPendingRazorpayPayment(organizationId: string, orderId: string, razorpayOrderId: string, amount: number): Promise<void> {
  await pool.query(
    `INSERT INTO payment (id, "organizationId", "orderId", amount, type, method, status, source, "receivedAt", "razorpayOrderId", "updatedAt")
     VALUES ($1, $2, $3, $4, 'ADVANCE', 'UPI', 'PENDING', 'RAZORPAY', now(), $5, now())`,
    [`pay_${Math.random().toString(36).slice(2, 10)}`, organizationId, orderId, amount, razorpayOrderId],
  );
}

export async function getPaymentsForOrder(orderId: string): Promise<{ status: string; amount: string; razorpayPaymentId: string | null }[]> {
  const { rows } = await pool.query<{ status: string; amount: string; razorpayPaymentId: string | null }>('SELECT status, amount::text, "razorpayPaymentId" FROM payment WHERE "orderId" = $1 ORDER BY "createdAt"', [orderId]);
  return rows;
}

export async function getOrderMoney(orderId: string): Promise<{ advance: string; balance: string; paymentStatus: string }> {
  const { rows } = await pool.query<{ advance: string; balance: string; paymentStatus: string }>('SELECT advance::text, balance::text, "paymentStatus"::text FROM "order" WHERE id = $1', [orderId]);
  return rows[0];
}

/** The customer link a "Send Invoice" produced (the log-only notify() keeps it in the notification payload). */
export async function getLatestInvoiceLink(organizationId: string, event: "invoice.sent" | "receipt.sent"): Promise<string | null> {
  const { rows } = await pool.query<{ url: string | null }>(
    `SELECT payload->>'url' AS url FROM notification WHERE "organizationId" = $1 AND event = $2 ORDER BY "createdAt" DESC LIMIT 1`,
    [organizationId, event],
  );
  return rows[0]?.url ?? null;
}

/** Chunk 20: runs a kitchen's trial out (or a paid period out), so the paywall applies. */
export async function expireSubscription(email: string): Promise<void> {
  await pool.query(
    `UPDATE subscription SET "trialEndsAt" = now() - interval '1 day'
     WHERE "endDate" IS NULL AND "organizationId" IN (SELECT m."organizationId" FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1)`,
    [email],
  );
}

/** Chunk 20: what a successful payment leaves behind, without going through Razorpay. */
export async function activatePaidPlan(email: string, planCode: string, daysFromNow: number): Promise<void> {
  await pool.query(
    `WITH org AS (SELECT m."organizationId" AS id FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1),
          ended AS (UPDATE subscription SET status = 'CANCELLED', "endDate" = now() WHERE "endDate" IS NULL AND "organizationId" IN (SELECT id FROM org))
     INSERT INTO subscription (id, "organizationId", "subscriptionPlanId", status, "startDate", "billingInterval", "currentPeriodEnd", "updatedAt")
     SELECT 'sub_' || substr(md5(random()::text), 1, 10), org.id, p.id, 'ACTIVE', now(), 'MONTHLY', now() + ($3 || ' days')::interval, now()
     FROM org, subscription_plan p WHERE p.code = $2`,
    [email, planCode, String(daysFromNow)],
  );
}

/** Chunk 23: moves a kitchen onto a plan that includes multiple locations (its own plan row, not the shared ones). */
export async function givePlanWithMultiLocation(email: string): Promise<void> {
  await pool.query(
    `INSERT INTO subscription_plan (id, code, name, "multiLocation", "updatedAt")
     VALUES ('plan_e2e_multi_location', 'e2e-multi-location', 'E2E Multi Location', true, now())
     ON CONFLICT (code) DO UPDATE SET "multiLocation" = true`,
  );
  await activatePaidPlan(email, "e2e-multi-location", 30);
}

/** Chunk 20: a paid plan payment with its invoice snapshot, as confirming a Razorpay payment would leave it. */
export async function seedPaidPlanPayment(email: string, invoiceNumber: string): Promise<string> {
  const id = `spay_${Math.random().toString(36).slice(2, 10)}`;
  const snapshot = {
    seller: { legalName: "Platterly Technologies", addressLine1: "1 Test Road", addressLine2: null, city: "Bengaluru", state: "Karnataka", stateCode: "29", postalCode: "560001", country: "India", gstin: "29ABCDE1234F1Z5", pan: "ABCDE1234F", sacCode: "998314", email: "billing@platterly.in", phone: null, website: null, note: null },
    buyer: { name: "ABC Caterer", addressLine1: null, addressLine2: null, city: "Mysuru", state: "Karnataka", postalCode: null, country: "India", gstin: "29AAAAA0000A1Z5" },
    gst: { kind: "INTRA", lines: [{ label: "CGST (9%)", amount: 270 }, { label: "SGST (9%)", amount: 270 }] },
    highlights: ["Unlimited orders", "Staff scheduling"],
  };
  await pool.query(
    `INSERT INTO subscription_payment (id, "organizationId", "subscriptionPlanId", interval, amount, "gstPercent", "gstAmount", total, status, "razorpayOrderId", "razorpayPaymentId", "invoiceNumber", "periodStart", "periodEnd", "paidAt", "invoiceSnapshot")
     SELECT $2, m."organizationId", p.id, 'MONTHLY', 3000, 18, 540, 3540, 'PAID', 'order_' || $2, 'pay_test1234', $3, now(), now() + interval '30 days', now(), $4::jsonb
     FROM member m JOIN "user" u ON u.id = m."userId", subscription_plan p WHERE u.email = $1 AND p.code = 'premium'`,
    [email, id, invoiceNumber, JSON.stringify(snapshot)],
  );
  return id;
}

/** Chunk 22: a storefront lead whose journey started from the kitchen's most recent visit from `source`. Returns the customer id. */
export async function seedLeadFromVisit(email: string, source: string): Promise<string> {
  const { rows: orgRows } = await pool.query<{ id: string }>(
    `SELECT m."organizationId" AS id FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1`,
    [email],
  );
  const organizationId = orgRows[0].id;
  const { rows: visitRows } = await pool.query<{ id: string }>(
    `SELECT id FROM storefront_visit WHERE "organizationId" = $1 AND source = $2 ORDER BY "visitedAt" DESC LIMIT 1`,
    [organizationId, source],
  );
  const customerId = `cust_${Math.random().toString(36).slice(2, 10)}`;
  await pool.query(
    `INSERT INTO customer (id, "organizationId", name, phone, "isEnquiry", "leadSource", "updatedAt") VALUES ($1, $2, 'Visit Lead', '+919800000088', true, 'STOREFRONT', now())`,
    [customerId, organizationId],
  );
  const eventTypeId = `et_${Math.random().toString(36).slice(2, 10)}`;
  await pool.query(`INSERT INTO event_type (id, "organizationId", name, "updatedAt") VALUES ($1, $2, 'Wedding', now())`, [eventTypeId, organizationId]);
  await pool.query(
    `INSERT INTO storefront_draft (id, "organizationId", "customerId", status, "currentStep", data, "visitId", "updatedAt") VALUES ($1, $2, $3, 'IN_PROGRESS', 2, $5::jsonb, $4, now())`,
    [`draft_${Math.random().toString(36).slice(2, 10)}`, organizationId, customerId, visitRows[0].id, JSON.stringify({ eventTypeId })],
  );
  return customerId;
}

/** Resets the platform sidebar notice to off and empty (the notice is one shared row, so a spec that sets it must put it back). */
export async function clearPlatformNotice(): Promise<void> {
  await pool.query(`DELETE FROM platform_notice WHERE id = 'platform'`);
}

/** Switches the platform sidebar notice on, as Platterly Ops's notice screen does for a product (the row catering reads while OPS_BILLING is off). */
export async function setPlatformNotice(notice: { title: string; message: string; buttonLabel: string; buttonUrl: string }): Promise<void> {
  await pool.query(
    `INSERT INTO platform_notice (id, enabled, title, message, "buttonLabel", "buttonUrl", "updatedAt") VALUES ('platform', true, $1, $2, $3, $4, now())
     ON CONFLICT (id) DO UPDATE SET enabled = true, title = $1, message = $2, "buttonLabel" = $3, "buttonUrl" = $4, "updatedAt" = now()`,
    [notice.title, notice.message, notice.buttonLabel, notice.buttonUrl],
  );
}

/** Switches the platform sidebar notice off (what Ops's "show the notice" switch does), keeping its text. */
export async function switchOffPlatformNotice(): Promise<void> {
  await pool.query(`UPDATE platform_notice SET enabled = false WHERE id = 'platform'`);
}

/** Approval payment spec: the references (UPI transaction numbers) of an order's payments. */
export async function getPaymentReferences(orderId: string): Promise<{ reference: string | null; status: string; amount: number }[]> {
  const { rows } = await pool.query('SELECT reference, status, amount FROM payment WHERE "orderId" = $1 ORDER BY "createdAt"', [orderId]);
  return rows.map((r) => ({ reference: r.reference, status: r.status, amount: Number(r.amount) }));
}

/** Approval payment spec: where the menu approval and the order stand (the customer must reach the confirmation before either changes). */
export async function getApprovalState(orderId: string): Promise<{ selection: string; order: string }> {
  const { rows } = await pool.query(
    `SELECT ms.status AS selection, o.status AS "order" FROM "order" o JOIN event e ON e."orderId" = o.id JOIN menu_selection ms ON ms."eventId" = e.id WHERE o.id = $1`,
    [orderId],
  );
  return { selection: rows[0].selection, order: rows[0].order };
}

/** Order lock spec: puts an order straight into a status (as the kitchen's hand-off or completion would). */
export async function setOrderStatus(orderId: string, status: "PENDING_REVIEW" | "AWAITING_CUSTOMER_APPROVAL" | "APPROVED" | "SENT_TO_KITCHEN" | "COMPLETED"): Promise<void> {
  await pool.query('UPDATE "order" SET status = $2 WHERE id = $1', [orderId, status]);
}

/** Marks the user's business as having claimed its public link, so the dashboard shows the real link and QR actions. */
export async function markPublicLinkClaimed(email: string): Promise<void> {
  await pool.query(
    `UPDATE organization SET "slugChangeCount" = 1
     WHERE id IN (SELECT m."organizationId" FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1)`,
    [email],
  );
}

export interface ReviewFixtureOptions {
  customer: string;
  /** Makes the order number and the menu / dish names the same on every run (1 to 99), so two runs can be compared pixel for pixel. */
  ordinal: number;
  status: "DRAFT" | "SENT_TO_CUSTOMER" | "CUSTOMER_REVIEWING" | "CHANGES_REQUESTED" | "CUSTOMER_APPROVED" | "FINAL_LOCKED";
  /** How many versions were sent to the customer (the last one is the current version while a menu is out). */
  versions?: number;
  /** Customer-picked dishes, no price: the team quotes a per-plate price. */
  customMenu?: boolean;
  /** A live customer link on the current version. */
  link?: boolean;
  venueSubmitted?: boolean;
  /** The order has an Event but no menu approval yet (legacy and not-started orders). */
  noSelection?: boolean;
  /** The order has no Event Type (so no Event and no menu approval, and none can start). */
  noEventType?: boolean;
  /** Put the order straight into this status (a Completed or Cancelled order). */
  orderStatus?: "COMPLETED" | "CANCELLED";
  notes?: { authorType: "CUSTOMER" | "KITCHEN" | "TEAM"; body: string; versionNumber?: number }[];
}

const ORDER_FOR_MENU = {
  DRAFT: "PENDING_REVIEW",
  CHANGES_REQUESTED: "PENDING_REVIEW",
  SENT_TO_CUSTOMER: "AWAITING_CUSTOMER_APPROVAL",
  CUSTOMER_REVIEWING: "AWAITING_CUSTOMER_APPROVAL",
  CUSTOMER_APPROVED: "APPROVED",
  FINAL_LOCKED: "SENT_TO_KITCHEN",
} as const;

/**
 * Menu Approvals review-page spec: one order three days out with a Dinner meal on a Menu (or, for a custom menu, a Dinner with
 * picked dishes and no Menu), one event, one menu selection in the given state, its sent versions (with dish ids in the
 * snapshot so Compare works), team/customer notes and, optionally, the live customer link. Inserted directly so a spec can
 * reach every state of the review page without driving the whole public flow.
 */
export async function seedReviewFixture(email: string, options: ReviewFixtureOptions): Promise<{ orderId: string; selectionId: string; customerPhone: string }> {
  const { rows: members } = await pool.query<{ organizationId: string }>('SELECT m."organizationId" FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1 LIMIT 1', [email]);
  const organizationId = members[0]?.organizationId;
  if (!organizationId) throw new Error(`No organization for ${email}`);
  const suffix = Math.random().toString(36).slice(2, 10);
  const orderId = `ord_${suffix}`;
  const eventId = `ev_${suffix}`;
  const selectionId = `ms_${suffix}`;
  const customerId = `cust_${suffix}`;
  const eventTypeId = `et_${suffix}`;
  const menuId = `mn_${suffix}`;
  const dishId = `mi_${suffix}`;
  const versions = options.versions ?? 0;
  // Fixed dates and times, so the page reads the same on every run (the planner and the history show them).
  const day = "2027-01-15";
  const sentAt = (hoursBack: number) => `2026-10-01 ${String(12 - hoursBack).padStart(2, "0")}:30:00+00`;
  const customerPhone = `+9199${Math.floor(10000000 + Math.random() * 89999999)}`;
  await pool.query('INSERT INTO customer (id, "organizationId", name, phone, "updatedAt") VALUES ($1, $2, $3, $4, now())', [customerId, organizationId, options.customer, customerPhone]);
  await pool.query('INSERT INTO event_type (id, "organizationId", name, "updatedAt") VALUES ($1, $2, $3, now())', [eventTypeId, organizationId, "Wedding"]);
  await pool.query(`INSERT INTO menu (id, "organizationId", name, "menuType", "pricePerPlate", "updatedAt") VALUES ($1, $2, $3, 'VEGETARIAN', 400, now())`, [menuId, organizationId, `Royal Dinner ${options.ordinal}`]);
  await pool.query(`INSERT INTO menu_item (id, "organizationId", name, "foodType", price, "updatedAt") VALUES ($1, $2, $3, 'VEGETARIAN', 150, now())`, [dishId, organizationId, `Paneer Tikka ${options.ordinal}`]);
  await pool.query(
    `INSERT INTO "order" (id, "organizationId", "customerId", "eventTypeId", "orderNumber", status, "eventStartDate", "eventEndDate", "totalParticipants", "adultCount", subtotal, total, balance, "venueDetailsSubmittedAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, '${options.orderStatus ?? ORDER_FOR_MENU[options.status]}', $6::date, $6::date, 100, 100, 40000, 40000, 40000, ${options.venueSubmitted ? "'2026-10-01 14:00:00+00'" : "NULL"}, now())`,
    [orderId, organizationId, customerId, options.noEventType ? null : eventTypeId, `ORD-${9000 + options.ordinal}`, day],
  );
  if (!options.noEventType) {
    await pool.query(
      `INSERT INTO event (id, "organizationId", "customerId", "eventTypeId", "orderId", name, "startDate", "endDate", "guestCount", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $7::date, 100, now())`,
      [eventId, organizationId, customerId, eventTypeId, orderId, `${options.customer} Wedding`, day],
    );
  }
  const mealId = `mp_${suffix}`;
  await pool.query(`INSERT INTO meal_plan_entry (id, "orderId", date, "mealType", "menuId") VALUES ($1, $2, $3::date, 'DINNER', $4)`, [mealId, orderId, day, options.customMenu ? null : menuId]);
  await pool.query(
    `INSERT INTO order_item (id, "orderId", "itemType", "menuItemId", name, "unitPrice", "mealPlanEntryId") VALUES ($1, $2, 'MENU_ITEM', $3, $4, 150, $5)`,
    [`oi_${suffix}`, orderId, dishId, `Paneer Tikka ${options.ordinal}`, mealId],
  );
  if (options.noSelection || options.noEventType) return { orderId, selectionId: "", customerPhone };
  await pool.query(
    `INSERT INTO menu_selection (id, "organizationId", "eventId", status, "kitchenProductionStatus", "currentVersion", "isCustomMenu", "lockedAt", "updatedAt")
     VALUES ($1, $2, $3, '${options.status}', 'PENDING', $4, $5, ${options.status === "FINAL_LOCKED" ? "'2026-10-02 12:00:00+00'" : "NULL"}, now())`,
    [selectionId, organizationId, eventId, Math.max(versions, 1), options.customMenu === true],
  );
  for (let v = 1; v <= versions; v++) {
    const snapshot = {
      customerName: options.customer,
      eventTypeName: "Wedding",
      eventStartDate: day,
      eventEndDate: day,
      venue: null,
      guests: 100,
      total: 40000 + v * 100,
      meals: [
        {
          date: day,
          mealType: "DINNER",
          menuName: `Royal Dinner ${options.ordinal}`,
          menuId,
          price: null,
          pricePerPlate: 400,
          items: [{ name: `Paneer Tikka ${options.ordinal}`, quantity: 1, itemType: "MENU_ITEM", catalogId: dishId, unitPrice: 150, category: "Starters" }],
        },
      ],
      selectedItems: [],
      isCustomMenu: options.customMenu === true,
    };
    const versionId = `mv_${suffix}_${v}`;
    await pool.query(
      `INSERT INTO menu_version (id, "menuSelectionId", "versionNumber", status, snapshot, "sentAt", "supersededAt")
       VALUES ($1, $2, $3, 'SENT_TO_CUSTOMER', $4, $5, ${v < versions ? "'2026-10-01 12:45:00+00'" : "NULL"})`,
      [versionId, selectionId, v, JSON.stringify(snapshot), sentAt(versions - v + 1)],
    );
    if (options.link && v === versions) {
      await pool.query(`INSERT INTO secure_access_token (id, "organizationId", "resourceType", "resourceId", token) VALUES ($1, $2, 'MENU_APPROVAL', $3, $4)`, [`sat_${suffix}`, organizationId, versionId, `tok_${suffix}`]);
    }
  }
  for (const [index, note] of (options.notes ?? []).entries()) {
    await pool.query(
      `INSERT INTO menu_approval_note (id, "organizationId", "menuSelectionId", "versionNumber", "authorType", "authorName", body, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [`mn_${suffix}_${index}`, organizationId, selectionId, note.versionNumber ?? null, note.authorType, note.authorType === "CUSTOMER" ? options.customer : null, note.body, `2026-10-01 13:0${index}:00+00`],
    );
  }
  return { orderId, selectionId, customerPhone };
}

/**
 * Replaces what a role may do in the user's business (the owner's Manage Role Permissions): `grants` maps a module to its actions, e.g.
 * { orders: ["view"], menus: ["view", "approve"] }. Used to make a role that can approve menus but cannot edit orders.
 */
export async function setRoleGrants(email: string, role: string, grants: Record<string, string[]>): Promise<void> {
  const { rows } = await pool.query<{ organizationId: string }>('SELECT m."organizationId" FROM member m JOIN "user" u ON u.id = m."userId" WHERE u.email = $1 LIMIT 1', [email]);
  const organizationId = rows[0]?.organizationId;
  if (!organizationId) throw new Error(`No organization for ${email}`);
  await pool.query(
    `INSERT INTO "RolePermissionOverride" (id, "organizationId", role, grants, "updatedAt") VALUES ($1, $2, $3, $4, now())
     ON CONFLICT ("organizationId", role) DO UPDATE SET grants = EXCLUDED.grants, "updatedAt" = now()`,
    [`rpo_${Math.random().toString(36).slice(2, 10)}`, organizationId, role, JSON.stringify(grants)],
  );
}

export async function getOrderRow(orderId: string): Promise<{ discount: string; total: string; notes: string | null }> {
  const { rows } = await pool.query('SELECT discount::text, total::text, notes FROM "order" WHERE id = $1', [orderId]);
  return rows[0];
}

export async function countInvoicesForOrder(orderId: string): Promise<number> {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM invoice WHERE "orderId" = $1', [orderId]);
  return rows[0].n;
}

/** Orders-list spec: moves an order and its event to a given day (an ISO date), e.g. into the past. */
export async function setOrderEventDay(orderId: string, isoDay: string): Promise<void> {
  await pool.query('UPDATE "order" SET "eventStartDate" = $2::date, "eventEndDate" = $2::date WHERE id = $1', [orderId, isoDay]);
  await pool.query('UPDATE event SET "startDate" = $2::date, "endDate" = $2::date WHERE "orderId" = $1', [orderId, isoDay]);
}

export async function getOrderKind(orderId: string): Promise<string> {
  const { rows } = await pool.query('SELECT "orderKind"::text AS kind FROM "order" WHERE id = $1', [orderId]);
  return rows[0].kind;
}
