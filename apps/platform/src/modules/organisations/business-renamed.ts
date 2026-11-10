import { signedHeaders, newId } from "@platterly/contract";
import { parseBusinessRenamed, verifyPlatformRequest, type BusinessRenamedAnswer } from "@platterly/platform-contract";
import type { PrismaClient } from "@/generated/prisma/client";
import { writeAudit } from "../audit/write-audit";
import { getIntegration, getSecrets } from "../integrations/registry";
import { lockOrganisation } from "./lock";

// A product reports that its business has a new name, so the Account and the Store show the name the person set in the product. Only the product the
// business is linked to may rename it. `nameVersion` orders the renames: anything not newer than the last applied one is answered `changed: false`, so a late
// retry never brings an old name back. Safe to repeat. Not exported from `index.ts` (it is a product message, not one of the staff services).

const MAX_BODY_BYTES = 16 * 1024;

function signed(secret: string, body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  return new Response(text, { status, headers: signedHeaders(secret, newId("command"), text) });
}

export async function receiveBusinessRenamed(deps: { prisma: PrismaClient }, request: { rawBody: string; headers: Headers; method: string; url: string }): Promise<Response> {
  const plain = (status: number, error: string) => Response.json({ error }, { status });
  if (request.rawBody.length > MAX_BODY_BYTES) return plain(413, "body_too_large");
  let json: unknown;
  try {
    json = JSON.parse(request.rawBody);
  } catch {
    return plain(400, "bad_json");
  }
  const parsed = parseBusinessRenamed(json);
  if (!parsed.ok) return plain(400, "invalid_message");
  const message = parsed.value;

  const integration = await getIntegration(deps.prisma, message.productKey);
  const secrets = integration ? await getSecrets(deps.prisma, message.productKey, "inbound") : null;
  if (!integration || !secrets) return plain(401, "unauthorized");
  const verified = verifyPlatformRequest([secrets.current, ...(secrets.previous ? [secrets.previous] : [])], request.headers, request.rawBody, request.method, request.url);
  if (!verified.ok) return plain(401, "unauthorized");
  const answer = (body: unknown, status = 200) => signed(secrets.current, body, status);
  if (integration.status !== "current") return answer({ error: "product_not_current" }, 409);

  const known = await deps.prisma.organisation.findUnique({ where: { id: message.businessId }, select: { id: true } });
  if (!known) return answer({ error: "business_unknown" }, 404);
  const linked = await deps.prisma.organisationProduct.findFirst({ where: { organisationId: message.businessId, productKey: message.productKey }, select: { organisationId: true } });
  if (!linked) return answer({ error: "not_your_business" }, 403);

  const ref = `product:${message.productKey}`;
  const changed = await deps.prisma.$transaction(async (tx) => {
    await lockOrganisation(tx, message.businessId);
    const org = await tx.organisation.findUniqueOrThrow({ where: { id: message.businessId }, select: { name: true, nameVersion: true } });
    if (BigInt(message.nameVersion) <= org.nameVersion) return false;
    await tx.organisation.update({ where: { id: message.businessId }, data: { name: message.businessName, nameVersion: BigInt(message.nameVersion) }, select: { id: true } });
    if (org.name === message.businessName) return false;
    await writeAudit(tx, {
      action: "organisation.renamed",
      outcome: "done",
      initiator: { kind: "system", ref },
      executor: { kind: "system", ref },
      organisationId: message.businessId,
      subject: { type: "organisation", id: message.businessId },
      before: { name: org.name },
      after: { name: message.businessName },
      requestId: message.messageId,
    });
    return true;
  });
  return answer({ businessId: message.businessId, changed } satisfies BusinessRenamedAnswer);
}
