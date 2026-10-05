import "server-only";
import { prisma } from "@/lib/db";
import { opsLink } from "./config";
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

/**
 * The scheduled part: send what is due, tell ops about any business it has not heard of yet (this also covers every
 * business that existed before the link was switched on; a business with no known owner email is skipped until it has one),
 * report each known business's usage once a day, and pull any snapshot that has gone stale (the backup to ops's pushes).
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
    for (const org of orgs) {
      if (usage >= limit) break;
      const key = `usage:${org.businessId}:${today}`;
      // Ops only accepts usage for a business it already knows, so a business with no sign-up queued yet (no owner email) waits.
      if (done.has(key) || !known.has(`signed_up:${org.businessId}`)) continue;
      if (await enqueueEvent({ type: "usage.reported", businessId: org.businessId, dedupeKey: key, data: { periodStart: `${today}T00:00:00.000Z`, counts: await usageCounts(org.id) } })) usage += 1;
    }

    const sent = await runDueOutbox(now);
    const pulled = await pullDueSnapshots(now);
    return { sent, signedUp, usage, pulled };
  } catch (error) {
    console.error("[ops-link] scheduled job failed:", error);
    return { sent: 0, signedUp: 0, usage: 0, pulled: 0 };
  }
}
