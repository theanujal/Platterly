import "server-only";
import { newId } from "@platterly/contract";
import { PULL_STATE_PATH, parseBusinessStateSnapshot, signPullRequest, verifyPullResponse, type BusinessStateSnapshot } from "@platterly/platform-contract";
import { prisma } from "@/lib/db";
import { PLATFORM_CLIENT_ID, platformAuthOrigin } from "@/lib/platform/config";
import { onTenantStatusChanged } from "@/modules/notifications/triggers";
import { platformSender } from "./config";
import { applyMembership } from "./membership";
import { applyOrganisationStatus } from "./organisation-status";

/**
 * The daily pull (plan F6.2.2, layer 2 of the permission sync). Caterly asks the Platform what it says about a business RIGHT NOW and repairs anything an
 * event did not deliver (a lost or dead-lettered membership or status change). The answer is used only if it is signed with Caterly's secret and the id of
 * this very request. It is applied with the same code that applies events, in ONE transaction, and then every event up to the snapshot's sequence counts as
 * seen, so a stale event that arrives later cannot undo the repair. If anything is refused the whole repair is rolled back and the business tries again next time.
 * Names, phone and email are not part of it (they follow the Account through `person.profile`).
 */
export type PullOutcome = "unchanged" | "repaired" | "skipped" | "failed";
const TIMEOUT_MS = 8000;
export const PULL_EVERY_MS = 23 * 3600_000;
class Refused extends Error {}

type Fetch = typeof fetch;

/** Fetches and verifies the snapshot. Returns a reason instead of throwing, so a bad answer changes nothing. */
export async function fetchBusinessState(businessId: string, fetchImpl: Fetch = fetch): Promise<{ ok: true; snapshot: BusinessStateSnapshot } | { ok: false; reason: string; notHere?: boolean }> {
  const sender = platformSender();
  if (!sender) return { ok: false, reason: "link_off" };
  const requestId = newId("command");
  const url = `${platformAuthOrigin()}${PULL_STATE_PATH}?businessId=${encodeURIComponent(businessId)}&productKey=${PLATFORM_CLIENT_ID}`;
  let response: Response;
  let text: string;
  try {
    response = await fetchImpl(url, { method: "GET", headers: signPullRequest(sender.answerSecret, requestId, url), signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error", cache: "no-store" });
    text = await response.text();
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? `unreachable: ${error.message}` : "unreachable" };
  }
  const verified = verifyPullResponse([sender.answerSecret], requestId, response.headers, text);
  if (!verified.ok) return { ok: false, reason: verified.error };
  if (response.status !== 200) {
    const code = typeof verified.value.error === "string" ? verified.value.error : `status_${response.status}`;
    // The Platform does not have this business (or not for Caterly): nothing to repair, not a fault.
    return { ok: false, reason: code, notHere: code === "business_unknown" || code === "not_your_business" };
  }
  const parsed = parseBusinessStateSnapshot(verified.value);
  if (!parsed.ok) return { ok: false, reason: parsed.error };
  if (parsed.value.businessId !== businessId) return { ok: false, reason: "wrong_business" };
  return { ok: true, snapshot: parsed.value };
}

/** Applies a verified snapshot. Returns true when something newer than what Caterly had seen was applied. */
export async function applySnapshot(snapshot: BusinessStateSnapshot, now: Date = new Date()): Promise<{ repaired: boolean; notice?: "SUSPENDED" | "ACTIVE" }> {
  const notice: { status?: "SUSPENDED" | "ACTIVE" } = {};
  const repaired = await prisma.$transaction(async (tx) => {
    // Moves the sequence up only when the snapshot is ahead of what Caterly has seen; a racing event that is already higher wins and nothing is repaired.
    const advanced = await tx.$executeRaw`INSERT INTO platform_event_state ("businessId", "lastSequence", "updatedAt", "lastPulledAt") VALUES (${snapshot.businessId}, ${snapshot.sequence}, now(), ${now})
      ON CONFLICT ("businessId") DO UPDATE SET "lastSequence" = EXCLUDED."lastSequence", "updatedAt" = now(), "lastPulledAt" = EXCLUDED."lastPulledAt" WHERE platform_event_state."lastSequence" < EXCLUDED."lastSequence"`;
    if (advanced !== 1) {
      await tx.$executeRaw`UPDATE platform_event_state SET "lastPulledAt" = ${now} WHERE "businessId" = ${snapshot.businessId}`;
      return false;
    }
    const status = await applyOrganisationStatus(tx, snapshot.businessId, { status: snapshot.status });
    if (!status.ok) throw new Refused(status.error);
    if (status.changedTo) notice.status = status.changedTo;
    // People who leave or are disabled first, then the active ones (an active Admin demotes any other owner, so that must come last).
    const ordered = [...snapshot.members].sort((a, b) => Number(a.status === "active") - Number(b.status === "active"));
    for (const m of ordered) {
      if (!m.subject) continue;
      const result = await applyMembership(tx, snapshot.businessId, { userId: m.userId, subject: m.subject, role: m.role, status: m.status, membershipVersion: snapshot.membershipVersion });
      if (!result.ok) throw new Refused(result.error);
    }
    return true;
  });
  if (notice.status) {
    const org = await prisma.organization.findUnique({ where: { businessId: snapshot.businessId }, select: { id: true } });
    if (org) await onTenantStatusChanged(org.id, notice.status);
  }
  return { repaired, notice: notice.status };
}

/** One business: fetch, verify, apply. Never throws. */
export async function reconcileBusiness(businessId: string, now: Date = new Date(), fetchImpl: Fetch = fetch): Promise<PullOutcome> {
  try {
    const got = await fetchBusinessState(businessId, fetchImpl);
    if (!got.ok) {
      if (got.reason === "link_off") return "skipped";
      if (got.notHere) {
        // The Platform does not know this business (an existing one not back-filled yet): note the visit so it is asked about once a day, not every run.
        await prisma.$executeRaw`INSERT INTO platform_event_state ("businessId", "lastSequence", "updatedAt", "lastPulledAt") VALUES (${businessId}, 0, now(), ${now})
          ON CONFLICT ("businessId") DO UPDATE SET "lastPulledAt" = EXCLUDED."lastPulledAt"`;
        return "skipped";
      }
      console.error(`[platform-link] pull for ${businessId} failed: ${got.reason}`);
      return "failed";
    }
    return (await applySnapshot(got.snapshot, now)).repaired ? "repaired" : "unchanged";
  } catch (error) {
    console.error(`[platform-link] pull for ${businessId} failed:`, error instanceof Refused ? error.message : error);
    return "failed";
  }
}

/** The scheduled job (`only` limits it to some businesses, for tests and one-off runs): every business not pulled in the last 23 hours, each on its own so one failure never stops the rest. */
export async function runDuePlatformPull(now: Date = new Date(), limit = 100, fetchImpl: Fetch = fetch, only?: readonly string[]): Promise<{ checked: number; repaired: number; failed: number }> {
  const totals = { checked: 0, repaired: 0, failed: 0 };
  if (!platformSender()) return totals;
  const since = new Date(now.getTime() - PULL_EVERY_MS);
  const orgs = await prisma.organization.findMany({ where: { status: { not: "DEACTIVATED" }, ...(only ? { businessId: { in: [...only] } } : {}) }, select: { businessId: true }, take: 1000 });
  const ids = orgs.map((o) => o.businessId);
  const states = await prisma.platformEventState.findMany({ where: { businessId: { in: ids } }, select: { businessId: true, lastPulledAt: true } });
  const pulledAt = new Map(states.map((s) => [s.businessId, s.lastPulledAt]));
  const due = ids.filter((id) => { const at = pulledAt.get(id); return !at || at < since; }).slice(0, limit);
  for (const id of due) {
    const outcome = await reconcileBusiness(id, now, fetchImpl);
    if (outcome === "skipped") continue;
    totals.checked += 1;
    if (outcome === "repaired") totals.repaired += 1;
    if (outcome === "failed") totals.failed += 1;
  }
  return totals;
}
