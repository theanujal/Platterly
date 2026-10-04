import "server-only";
import { prisma } from "@/lib/db";
import { getPublishedTenantBySlug } from "@/modules/tenants/tenant";
import { classifySource, cleanSrcTag, parseUserAgent, pickClientIp, pickLocation, referrerHost, visitorKey } from "./visit-math";

/**
 * Chunk 22 (AJ, 2026-10-04): where a kitchen's storefront visitors come from. One row per visit; the browser reports
 * it once per session from `/api/visit`. The IP address, city and browser string are personal data, so the daily job
 * blanks them after 90 days (`scrubOldVisits`) and keeps the totals.
 */
export const VISIT_RETENTION_DAYS = 90;
const REPEAT_WINDOW_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface VisitReport {
  slug: string;
  src?: unknown;
  referrer?: string | null;
  embedded?: boolean;
  ancestor?: string | null;
}

const short = (value: unknown, max: number) => (typeof value === "string" && value.length <= max ? value : null);

/** Writes the visit down and returns its id, or null for a bot, an unpublished kitchen or a locked one. */
export async function recordVisit(report: VisitReport, headers: Headers, now: Date = new Date()): Promise<string | null> {
  const ua = headers.get("user-agent");
  const agent = parseUserAgent(ua);
  if (agent.bot) return null;
  const organization = await getPublishedTenantBySlug(report.slug);
  if (!organization) return null;

  const ip = pickClientIp(headers);
  const { source, detail } = classifySource({
    src: report.src,
    referrer: short(report.referrer, 2000),
    embedded: report.embedded === true,
    ancestor: short(report.ancestor, 2000),
    ownHost: headers.get("x-forwarded-host") ?? headers.get("host"),
  });
  const key = visitorKey(ip, ua, now, process.env.BETTER_AUTH_SECRET ?? "platterly");

  const location = pickLocation(headers);
  // A reload or a second tab a moment later is the same visit. Two reports can arrive at the same instant, so the
  // look-up and the write happen under one lock per kitchen and visitor, never two rows.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`${organization.id}:${key}:${source}`}))`;
    const recent = await tx.storefrontVisit.findFirst({
      where: { organizationId: organization.id, visitorKey: key, source, visitedAt: { gt: new Date(now.getTime() - REPEAT_WINDOW_MS) } },
      select: { id: true },
    });
    if (recent) return recent.id;
    const row = await tx.storefrontVisit.create({
      data: {
        organizationId: organization.id,
        visitedAt: now,
        source,
        sourceDetail: detail?.slice(0, 120) ?? null,
        device: agent.device,
        browser: agent.browser,
        country: location.country,
        city: location.city,
        ipAddress: ip,
        userAgent: ua?.slice(0, 300) ?? null,
        visitorKey: key,
      },
      select: { id: true },
    });
    return row.id;
  });
}

/** Blanks the personal fields on visits older than the retention period. Safe to run any number of times. */
export async function scrubOldVisits(now: Date = new Date()): Promise<number> {
  const result = await prisma.storefrontVisit.updateMany({
    where: { visitedAt: { lt: new Date(now.getTime() - VISIT_RETENTION_DAYS * DAY_MS) }, OR: [{ ipAddress: { not: null } }, { city: { not: null } }, { userAgent: { not: null } }] },
    data: { ipAddress: null, city: null, userAgent: null },
  });
  return result.count;
}

/** A visit id from the browser is only trusted if it belongs to this kitchen. */
export async function ownVisitId(organizationId: string, visitId: unknown): Promise<string | null> {
  const id = short(visitId, 40);
  if (!id) return null;
  const visit = await prisma.storefrontVisit.findFirst({ where: { id, organizationId }, select: { id: true } });
  return visit?.id ?? null;
}

export { cleanSrcTag, referrerHost };
