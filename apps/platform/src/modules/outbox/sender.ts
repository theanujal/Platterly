import { PLATFORM_CONTRACT_VERSION, PLATFORM_EVENTS_PATH, parsePlatformEvent, signPlatformRequest } from "@platterly/platform-contract";
import { verifyRequest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { getIntegration, getSecrets } from "../integrations/registry";
import type { DeliverableEvent, Sender } from "./deliver";

// F6.2.1 real signed sender (checkpoint IC1). One POST per outbox event to `{product base URL}/api/platform/events`, signed for that route with the
// product's OUTBOUND secret from the registry; the product's answer must be signed with its INBOUND secret. A product that is not registered, or whose
// status is not `current`, is refused: the attempt fails and the worker's normal backoff applies (the event is never dropped).

const TIMEOUT_MS = 10_000;

/** The contract's `evt_<32 hex>` id for an outbox row: the same row always gives the same id, so a retry is the same event to the product. */
export const wireEventId = (outboxEventId: string): string => `evt_${outboxEventId.replace(/-/g, "").toLowerCase()}`;

type Registry = {
  integration: (key: string) => Promise<Awaited<ReturnType<typeof getIntegration>>>;
  secrets: (key: string, direction: "outbound" | "inbound") => Promise<Awaited<ReturnType<typeof getSecrets>>>;
};
type Identities = { subjectFor: (platformUserId: string) => Promise<string | null> };
const realIdentities: Identities = { subjectFor: async (userId) => (await prisma.userIdentity.findFirst({ where: { userId }, select: { subject: true }, orderBy: { createdAt: "asc" } }))?.subject ?? null };
const realRegistry: Registry = { integration: (key) => getIntegration(prisma, key), secrets: (key, direction) => getSecrets(prisma, key, direction) };

type Deps = { fetch?: typeof fetch; timeoutMs?: number; registry?: Registry; identities?: Identities };

export function createSender(deps: Deps = {}): Sender {
  const doFetch = deps.fetch ?? fetch;
  const registry = deps.registry ?? realRegistry;
  const identities = deps.identities ?? realIdentities;
  return async (event: DeliverableEvent) => {
    const integration = await registry.integration(event.productKey);
    if (!integration) return { ok: false, error: `product ${event.productKey} is not registered` };
    if (integration.status !== "current") return { ok: false, error: `product ${event.productKey} is ${integration.status}, not current` };
    if (event.sequence > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, error: "sequence is too large to send" };

    // A membership event names the person by the Platform's user id; the product links people by the identity provider's person id, so it is added here.
    // It is looked up at SEND time, so events queued before this existed carry it too.
    let data = event.payload;
    if (event.eventType === "membership.changed" && typeof data === "object" && data !== null && !("subject" in data)) {
      const userId = (data as { userId?: unknown }).userId;
      const subject = typeof userId === "string" ? await identities.subjectFor(userId) : null;
      if (!subject) return { ok: false, error: "the person has no sign-in identity yet, so the product cannot be told who they are" };
      data = { ...(data as Record<string, unknown>), subject };
    }

    const eventId = wireEventId(event.eventId);
    const body = JSON.stringify({ version: PLATFORM_CONTRACT_VERSION, eventId, businessId: event.organisationId, sequence: Number(event.sequence), occurredAt: event.createdAt.toISOString(), type: event.eventType, data });
    const checked = parsePlatformEvent(JSON.parse(body));
    if (!checked.ok) return { ok: false, error: `event is not valid: ${checked.error}` };

    const outbound = await registry.secrets(event.productKey, "outbound");
    const inbound = await registry.secrets(event.productKey, "inbound");
    if (!outbound || !inbound) return { ok: false, error: `product ${event.productKey} has no secrets` };

    const url = `${integration.baseUrl}${PLATFORM_EVENTS_PATH}`;
    let res: Response;
    try {
      res = await doFetch(url, { method: "POST", body, headers: signPlatformRequest(outbound.current, eventId, body, "POST", url), redirect: "manual", signal: AbortSignal.timeout(deps.timeoutMs ?? TIMEOUT_MS) });
    } catch (error) {
      return { ok: false, error: `could not reach ${event.productKey}: ${error instanceof Error ? error.message : "unknown"}` };
    }
    const text = await res.text().catch(() => "");
    if (res.status !== 200) return { ok: false, error: `${event.productKey} answered ${res.status}` };
    // A 200 only counts when the product itself signed it; otherwise something else answered.
    const answer = verifyRequest([inbound.current, ...(inbound.previous ? [inbound.previous] : [])], res.headers, text);
    if (!answer.ok) return { ok: false, error: `${event.productKey}'s answer was not signed correctly (${answer.reason})` };
    return { ok: true };
  };
}

// Always available: with no registered product an event simply fails its attempt and waits, so the cron route never needs to refuse to run.
export function getSender(): Sender {
  return createSender();
}
