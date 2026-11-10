import { isId } from "@platterly/contract";
import { signPullResponse, verifyPlatformRequest, type BusinessStateSnapshot } from "@platterly/platform-contract";
import type { PrismaClient } from "@/generated/prisma/client";
import { getIntegration, getSecrets } from "../integrations/registry";
import { findSubjectForUser } from "../users/subject";

// Layer 2 of the permission sync (plan F6.2.2): a product asks what the Platform says about ONE of its businesses right now, so it can repair an event it
// missed. The request is a route-bound GET signed with the product's inbound secret (the query is signed too, so the business id cannot be swapped); the
// answer is signed with the same secret and the request's own id, so it cannot be passed off as the answer to another pull. A product can only ask about a
// business that is linked to it. The state is read in one consistent snapshot. Names, phone and email are not included.

export type StateDeps = { prisma: PrismaClient };

export async function readBusinessState(prisma: PrismaClient, businessId: string): Promise<BusinessStateSnapshot | null> {
  return prisma.$transaction(
    async (tx) => {
      const org = await tx.organisation.findUnique({ where: { id: businessId }, select: { status: true, outboxSequence: true, membershipVersion: true } });
      if (!org) return null;
      const rows = await tx.organisationMember.findMany({ where: { organisationId: businessId }, select: { userId: true, centralRole: true, status: true }, orderBy: { createdAt: "asc" } });
      const subjectOf = new Map<string, string | null>();
      for (const userId of new Set(rows.map((r) => r.userId))) subjectOf.set(userId, await findSubjectForUser(tx, userId));
      return {
        businessId,
        status: org.status === "suspended" ? "suspended" : org.status === "closed" ? "closed" : "active",
        sequence: Number(org.outboxSequence),
        membershipVersion: Number(org.membershipVersion),
        members: rows.map((r) => ({ userId: r.userId, subject: subjectOf.get(r.userId) ?? null, role: r.centralRole, status: r.status as "active" | "disabled" | "removed" })),
      } satisfies BusinessStateSnapshot;
    },
    { isolationLevel: "RepeatableRead" },
  );
}

/** The route's whole job, with no Next.js types so tests call it directly. */
export async function answerStatePull(deps: StateDeps, request: { headers: Headers; method: string; url: string }): Promise<Response> {
  const plain = (status: number, error: string) => Response.json({ error }, { status });
  const url = new URL(request.url);
  const businessId = url.searchParams.get("businessId");
  const productKey = url.searchParams.get("productKey");
  if (!isId("business", businessId) || !productKey) return plain(400, "invalid_request");

  const integration = await getIntegration(deps.prisma, productKey);
  const secrets = integration ? await getSecrets(deps.prisma, productKey, "inbound") : null;
  if (!integration || !secrets) return plain(401, "unauthorized");
  const verified = verifyPlatformRequest([secrets.current, ...(secrets.previous ? [secrets.previous] : [])], request.headers, "", request.method, request.url);
  if (!verified.ok) return plain(401, "unauthorized");
  const answer = (body: unknown, status = 200) => {
    const text = JSON.stringify(body);
    return new Response(text, { status, headers: signPullResponse(secrets.current, verified.id, text) });
  };
  if (integration.status !== "current") return answer({ error: "product_not_current" }, 409);

  const linked = await deps.prisma.organisationProduct.findFirst({ where: { organisationId: businessId, productKey }, select: { organisationId: true } });
  if (!linked) return answer({ error: "not_your_business" }, 403);
  const state = await readBusinessState(deps.prisma, businessId);
  if (!state) return answer({ error: "business_unknown" }, 404);
  return answer(state);
}


