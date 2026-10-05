import "server-only";
import { newId, parseSnapshot, signedHeaders, verifyRequest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { opsLink } from "./config";
import { CATERING_ENTITLEMENTS } from "./manifest";
import { storeSnapshot } from "./snapshots";

/**
 * The backup to ops's pushes (docs/ops-contract.md section 5): once a day catering asks ops for the current snapshot of any
 * business whose stored one is missing or older than a day. A lost push is then healed within a day. Ops answers 404 for a
 * business it has no subscription for; that is remembered (`ops_pull`) so it is not asked again every minute.
 * The request is signed with the event secret; the reply must be signed by ops, or it is ignored.
 */
export const PULL_EVERY_HOURS = 24;
const TIMEOUT_MS = 5000;

export async function pullSnapshot(organizationId: string, businessId: string, fetchImpl: typeof fetch = fetch): Promise<"stored" | "unchanged" | "none" | "failed"> {
  const config = opsLink();
  if (!config) return "failed";
  try {
    const response = await fetchImpl(`${config.baseUrl}/api/products/${config.productKey}/snapshots/${businessId}`, {
      method: "GET",
      headers: signedHeaders(config.eventSecret, newId("command"), ""),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
    const text = await response.text();
    await prisma.opsPull.upsert({ where: { businessId }, create: { businessId, lastPulledAt: new Date(), lastStatus: response.status }, update: { lastPulledAt: new Date(), lastStatus: response.status } });
    if (response.status === 404) return "none";
    if (!response.ok) return "failed";
    if (!verifyRequest(config.commandSecrets, response.headers, text).ok) return "failed";
    const parsed = parseSnapshot(JSON.parse(text), CATERING_ENTITLEMENTS);
    // A snapshot for another business, or for another product, is not for this kitchen, whoever signed it.
    if (!parsed.ok || parsed.value.businessId !== businessId || parsed.value.productKey !== config.productKey) return "failed";
    return (await storeSnapshot(organizationId, parsed.value)).applied ? "stored" : "unchanged";
  } catch (error) {
    console.error("[ops-link] snapshot pull failed:", error);
    return "failed";
  }
}

export async function pullDueSnapshots(now: Date = new Date(), limit = 50): Promise<number> {
  if (!opsLink()) return 0;
  const cutoff = new Date(now.getTime() - PULL_EVERY_HOURS * 3_600_000);
  const orgs = await prisma.organization.findMany({ select: { id: true, businessId: true }, orderBy: { createdAt: "asc" } });
  const [pulls, snapshots] = await Promise.all([
    prisma.opsPull.findMany({ where: { businessId: { in: orgs.map((o) => o.businessId) } } }),
    prisma.opsSnapshot.findMany({ where: { organizationId: { in: orgs.map((o) => o.id) } }, select: { businessId: true, receivedAt: true } }),
  ]);
  const lastPulled = new Map(pulls.map((p) => [p.businessId, p.lastPulledAt]));
  const received = new Map(snapshots.map((s) => [s.businessId, s.receivedAt]));
  let stored = 0;
  let asked = 0;
  for (const org of orgs) {
    if (asked >= limit) break;
    const pulledAt = lastPulled.get(org.businessId);
    const snapshotAt = received.get(org.businessId);
    if ((pulledAt && pulledAt > cutoff) || (snapshotAt && snapshotAt > cutoff)) continue;
    asked += 1;
    if ((await pullSnapshot(org.id, org.businessId)) === "stored") stored += 1;
  }
  return stored;
}
