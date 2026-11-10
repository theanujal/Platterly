import { signedHeaders, newId } from "@platterly/contract";
import { parseBusinessCreated, verifyPlatformRequest, type BusinessCreatedAnswer } from "@platterly/platform-contract";
import type { PrismaClient } from "@/generated/prisma/client";
import { IDP_PROVIDER } from "../auth/config";
import { getIntegration, getSecrets } from "../integrations/registry";
import { findOrCreateBySubject, type IdentityLinkClient } from "../users/identity-link";
import { mintProviderEmailAssertion } from "../users/provider-assertion";
import { createOrganisation } from "./create";

// A product reports that a person who came through its sign-in made a business (plan step 4). The person's email is NOT taken from the product: it is read from the
// identity provider's own record for that person (`readPerson`), which only exists once the person verified their email with the code. The person is then found or
// created on the Platform (linked by the provider's person id, never by email) and the business is created with them as its Admin, under the product's own business id.
// Safe to repeat: a business that already exists is answered `created: false` and nothing changes.

const MAX_BODY_BYTES = 16 * 1024;

export type IdentityPerson = { email: string; emailVerified: boolean };
export type Outcome = { status: number; body: unknown; secret?: string };

export type BusinessCreatedDeps = {
  prisma: PrismaClient;
  /** The identity provider's record for a person id (the sign-in's `sub`), or null. */
  readPerson: (subject: string) => Promise<IdentityPerson | null>;
  /** Tests pass a transaction so nothing is committed; production uses the shared client. */
  linkClient?: IdentityLinkClient;
};

function signed(secret: string, body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  return new Response(text, { status, headers: signedHeaders(secret, newId("command"), text) });
}

/** Everything the route does, with no Next.js types so tests call it directly. Always answers JSON; signs the answer once the product is known. */
export async function receiveBusinessCreated(deps: BusinessCreatedDeps, request: { rawBody: string; headers: Headers; method: string; url: string }): Promise<Response> {
  const plain = (status: number, error: string) => Response.json({ error }, { status });
  if (request.rawBody.length > MAX_BODY_BYTES) return plain(413, "body_too_large");
  let json: unknown;
  try {
    json = JSON.parse(request.rawBody);
  } catch {
    return plain(400, "bad_json");
  }
  const parsed = parseBusinessCreated(json);
  if (!parsed.ok) return plain(400, "invalid_message");
  const message = parsed.value;

  // The product is named in the body, but nothing is trusted until the signature checks out against THAT product's own secret.
  const integration = await getIntegration(deps.prisma, message.productKey);
  const secrets = integration ? await getSecrets(deps.prisma, message.productKey, "inbound") : null;
  if (!integration || !secrets) return plain(401, "unauthorized");
  const verified = verifyPlatformRequest([secrets.current, ...(secrets.previous ? [secrets.previous] : [])], request.headers, request.rawBody, request.method, request.url);
  if (!verified.ok) return plain(401, "unauthorized");
  const answer = (body: unknown, status = 200) => signed(secrets.current, body, status);
  if (integration.status !== "current") return answer({ error: "product_not_current" }, 409);

  const existing = await deps.prisma.organisation.findUnique({ where: { id: message.businessId }, select: { id: true } });
  if (existing) return answer({ businessId: message.businessId, created: false } satisfies BusinessCreatedAnswer);

  const person = await deps.readPerson(message.owner.subject);
  if (!person) return answer({ error: "person_unknown" }, 404);
  if (!person.emailVerified) return answer({ error: "email_not_verified" }, 422);

  const linked = await findOrCreateBySubject({
    provider: IDP_PROVIDER,
    subject: message.owner.subject,
    email: person.email,
    emailAssertion: mintProviderEmailAssertion({ provider: IDP_PROVIDER, subject: message.owner.subject, email: person.email }),
  }, deps.linkClient);
  if (!linked.ok) return answer({ error: linked.reason }, 409);

  const ref = `product:${message.productKey}`;
  const result = await deps.prisma.$transaction((tx) =>
    createOrganisation(tx, { initiator: { kind: "system", ref }, executor: { kind: "system", ref }, requestId: message.messageId }, {
      userId: linked.user.id,
      idempotencyKey: `${message.productKey}-created-${message.businessId}`,
      name: message.businessName,
      productKey: message.productKey,
      organisationId: message.businessId,
    }),
  );
  if (!result.ok) return answer({ error: result.code }, 409);
  return answer({ businessId: result.organisationId, created: result.created } satisfies BusinessCreatedAnswer);
}
