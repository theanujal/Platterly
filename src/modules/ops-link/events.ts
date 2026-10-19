import "server-only";
import { prisma } from "@/lib/db";
import { opsBillingOn, opsLink } from "./config";
import { usageCounts } from "./directory";
import { emitEvent, enqueueEvent, runDueOutbox } from "./outbox";
import { pullDueSnapshots } from "./pull";

/** Everything here is fire-and-forget: a problem with ops is logged and never reaches the kitchen's request. */

const person = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(" ").trim();

/** The owner's name and email as ops should know them, or null when no email is known (ops needs one). */
async function ownerOf(organizationId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { businessId: true, name: true, ownerFirstName: true, ownerLastName: true, contactEmail: true } });
  if (!org) return null;
  const owner = await prisma.member.findFirst({ where: { organizationId, role: "owner" }, orderBy: { createdAt: "asc" }, select: { user: { select: { name: true, email: true } } } });
  const email = owner?.user.email ?? org.contactEmail;
  if (!email || !email.includes("@")) return null;
  return { businessId: org.businessId, businessName: org.name.trim() || "Unnamed Business", ownerName: person(org.ownerFirstName, org.ownerLastName) || owner?.user.name?.trim() || "Owner", ownerEmail: email };
}

/** Tells ops a business exists. Queued once per business: the catch-up job and the sign-up hook share one dedupe key. */
export async function emitBusinessSignedUp(organizationId: string): Promise<void> {
  try {
    if (!opsLink()) return;
    const owner = await ownerOf(organizationId);
    if (!owner) return;
    await emitEvent({ type: "business.signed_up", businessId: owner.businessId, dedupeKey: `signed_up:${owner.businessId}`, data: { businessName: owner.businessName, ownerName: owner.ownerName, ownerEmail: owner.ownerEmail } });
  } catch (error) {
    console.error("[ops-link] sign-up event failed:", error);
  }
}

/**
 * Asks ops to send the owner a welcome email (docs/ops-contract.md 9: products never send Platterly's own messages). Only once
 * ops owns billing and messaging (OPS_BILLING on); queued after the sign-up event, once per business.
 */
export async function emitWelcomeRequested(organizationId: string): Promise<void> {
  try {
    if (!opsBillingOn()) return;
    const owner = await ownerOf(organizationId);
    if (!owner) return;
    await emitEvent({ type: "message.requested", businessId: owner.businessId, dedupeKey: `welcome:${owner.businessId}`, data: { template: "welcome_owner", variables: {} } });
  } catch (error) {
    console.error("[ops-link] welcome request failed:", error);
  }
}

/** Sent when a business is renamed or its owner's name changes. Only the fields that really changed go in. */
export async function emitBusinessUpdated(before: { name: string; ownerFirstName: string | null; ownerLastName: string | null }, organizationId: string): Promise<void> {
  try {
    if (!opsLink()) return;
    const after = await prisma.organization.findUnique({ where: { id: organizationId }, select: { businessId: true, name: true, ownerFirstName: true, ownerLastName: true } });
    if (!after) return;
    const data: { businessName?: string; ownerName?: string } = {};
    if (after.name.trim() && after.name !== before.name) data.businessName = after.name.trim();
    const ownerName = person(after.ownerFirstName, after.ownerLastName);
    if (ownerName && ownerName !== person(before.ownerFirstName, before.ownerLastName)) data.ownerName = ownerName;
    if (Object.keys(data).length === 0) return;
    await emitEvent({ type: "business.updated", businessId: after.businessId, data });
  } catch (error) {
    console.error("[ops-link] update event failed:", error);
  }
}

const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The scheduled part: send what is due, tell ops about any business it has not heard of yet (this also covers every
 * business that existed before the link was switched on; a business with no known owner email is skipped until it has one),
 * report each known business's usage (once a day as a backstop, and again within a minute of any total changing, so Ops stays current
 * without a hook in every order action), and pull any snapshot that has gone stale (the backup to ops's pushes).
 */
export async function runOpsLinkJobs(now: Date = new Date(), limit = 200): Promise<{ sent: number; signedUp: number; usage: number; pulled: number }> {
  if (!opsLink()) return { sent: 0, signedUp: 0, usage: 0, pulled: 0 };
  try {
    let signedUp = 0;
    const known = new Set((await prisma.opsOutbox.findMany({ where: { dedupeKey: { startsWith: "signed_up:" } }, select: { dedupeKey: true } })).map((r) => r.dedupeKey));
    const orgs = await prisma.organization.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, businessId: true } });
    for (const org of orgs) {
      if (signedUp >= limit) break;
      if (known.has(`signed_up:${org.businessId}`)) continue;
      const owner = await ownerOf(org.id);
      if (!owner) continue;
      if (await enqueueEvent({ type: "business.signed_up", businessId: org.businessId, dedupeKey: `signed_up:${org.businessId}`, data: { businessName: owner.businessName, ownerName: owner.ownerName, ownerEmail: owner.ownerEmail, backfill: true } })) {
        signedUp += 1;
        known.add(`signed_up:${org.businessId}`);
      }
    }

    let usage = 0;
    const today = dayOf(now);
    const done = new Set((await prisma.opsOutbox.findMany({ where: { dedupeKey: { startsWith: "usage:", endsWith: `:${today}` } }, select: { dedupeKey: true } })).map((r) => r.dedupeKey));
    // The counts each business last reported (newest first, so the first row seen per business wins).
    const lastCounts = new Map<string, Record<string, number>>();
    const recent = await prisma.opsOutbox.findMany({ where: { type: "usage.reported", createdAt: { gte: new Date(now.getTime() - 2 * DAY_MS) } }, orderBy: { createdAt: "desc" }, select: { businessId: true, payload: true } });
    for (const row of recent) {
      const counts = (row.payload as { data?: { counts?: Record<string, number> } } | null)?.data?.counts;
      if (counts && !lastCounts.has(row.businessId)) lastCounts.set(row.businessId, counts);
    }
    for (const org of orgs) {
      if (usage >= limit) break;
      // Ops only accepts usage for a business it already knows, so a business with no sign-up queued yet (no owner email) waits.
      if (!known.has(`signed_up:${org.businessId}`)) continue;
      const dailyKey = `usage:${org.businessId}:${today}`;
      const counts = await usageCounts(org.id);
      const last = lastCounts.get(org.businessId);
      const changed = !last || JSON.stringify(Object.entries(last).sort()) !== JSON.stringify(Object.entries(counts).sort());
      // The first report of the day always goes (the backstop); after that a report goes whenever a total has changed, at most one a minute.
      const key = !done.has(dailyKey) ? dailyKey : changed ? `usage:${org.businessId}:${now.toISOString().slice(0, 16)}` : null;
      if (key && (await enqueueEvent({ type: "usage.reported", businessId: org.businessId, dedupeKey: key, data: { periodStart: `${today}T00:00:00.000Z`, counts } }))) usage += 1;
    }

    const sent = await runDueOutbox(now);
    const pulled = await pullDueSnapshots(now);
    return { sent, signedUp, usage, pulled };
  } catch (error) {
    console.error("[ops-link] scheduled job failed:", error);
    return { sent: 0, signedUp: 0, usage: 0, pulled: 0 };
  }
}
