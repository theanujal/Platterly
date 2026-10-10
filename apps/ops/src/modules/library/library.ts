import "server-only";
import { newId, parseLibraryCandidates, signedHeaders, verifyRequest, type LibraryDecision } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifySafely } from "@/modules/notifications/notifications";
import { secretsOf } from "@/modules/registry/products";

/**
 * The library review (docs/ops-contract.md section 30). Ops pulls what kitchens added that a product's library lacks, a person
 * decides here, and the decision goes back to the product with a signed POST. Ops never reads the product's database.
 */
const TIMEOUT_MS = 20_000;
const CHECK_EVERY_MS = 30 * 60 * 1000;

export class LibraryReviewError extends Error {}

export type PullResult = { ok: true; created: number; updated: number; withdrawn: number } | { ok: false; error: string };

/** Asks one product for its library candidates and stores them. Decided candidates are never reopened. */
export async function pullLibraryCandidates(productKey: string, fetchImpl: typeof fetch = fetch): Promise<PullResult> {
  const product = await prisma.product.findUnique({ where: { key: productKey } });
  if (!product || product.status !== "ACTIVE") return { ok: false, error: "This product is not active." };
  let secrets: ReturnType<typeof secretsOf>;
  try {
    secrets = secretsOf(product);
  } catch {
    return { ok: false, error: "The product's signing secret could not be read. Rotate its secrets." };
  }
  try {
    const response = await fetchImpl(`${product.baseUrl}/api/ops/library/candidates`, { method: "GET", headers: signedHeaders(secrets.sign, newId("command"), ""), signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
    const text = await response.text();
    if (response.status === 404) return { ok: true, created: 0, updated: 0, withdrawn: 0 }; // this product has no library review
    if (!response.ok) return { ok: false, error: `The product answered ${response.status}.` };
    const verified = verifyRequest(secrets.accept, response.headers, text);
    if (!verified.ok) return { ok: false, error: `The answer was not signed correctly (${verified.reason}).` };
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: "The answer was not JSON." };
    }
    const parsed = parseLibraryCandidates(json);
    if (!parsed.ok) return { ok: false, error: `The list is invalid: ${parsed.error}.` };

    let created = 0;
    let updated = 0;
    for (const c of parsed.value.candidates) {
      const data = { kind: c.kind, name: c.name, categoryName: c.categoryName, foodType: c.foodType, unit: c.unit, kitchenCount: c.kitchenCount, suggestedMatchId: c.suggestedMatchId, suggestedMatchName: c.suggestedMatchName, photoUrl: c.photoUrl };
      const existing = await prisma.libraryCandidate.findUnique({ where: { productKey_remoteId: { productKey, remoteId: c.id } } });
      if (!existing) {
        await prisma.libraryCandidate.create({ data: { productKey, remoteId: c.id, ...data } });
        created += 1;
      } else if (existing.status === "PENDING" || existing.status === "WITHDRAWN") {
        await prisma.libraryCandidate.update({ where: { id: existing.id }, data: { ...data, status: "PENDING" } });
        updated += 1;
      }
    }
    // Pending ones the product no longer lists (when the list is complete) are withdrawn, not left for a reviewer to chase.
    let withdrawn = 0;
    if (parsed.value.candidates.length < 500) {
      const listed = parsed.value.candidates.map((c) => c.id);
      withdrawn = (await prisma.libraryCandidate.updateMany({ where: { productKey, status: "PENDING", remoteId: { notIn: listed } }, data: { status: "WITHDRAWN" } })).count;
    }
    if (created > 0) {
      await notifySafely({ productKey, kind: "library.review", title: `${created} new item${created === 1 ? "" : "s"} for the library`, body: "Kitchens added dishes or ingredients the library does not have. Review them in Library review.", link: "/library", dedupeKey: `library:${productKey}:${new Date().toISOString().slice(0, 13)}` });
    }
    return { ok: true, created, updated, withdrawn };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `Could not reach the product: ${error.message}` : "Could not reach the product." };
  }
}

/** The scheduled job's step: each active product (or one) at most every half hour. Returns how many new candidates came in. */
export async function refreshLibraryCandidates(now: Date = new Date(), onlyProduct?: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const products = await prisma.product.findMany({ where: { status: "ACTIVE", ...(onlyProduct ? { key: onlyProduct } : {}) }, select: { key: true, libraryCheckedAt: true } });
  let created = 0;
  for (const p of products) {
    if (p.libraryCheckedAt && now.getTime() - p.libraryCheckedAt.getTime() < CHECK_EVERY_MS) continue;
    await prisma.product.update({ where: { key: p.key }, data: { libraryCheckedAt: now } });
    const result = await pullLibraryCandidates(p.key, fetchImpl);
    if (result.ok) created += result.created;
  }
  return created;
}

export interface ReviewInput {
  action: "approve" | "merge" | "reject";
  entry?: LibraryDecision["entry"];
  mergeIntoId?: string;
}

/** Sends the reviewer's answer to the product and, when the product accepted it, records the outcome here. */
export async function decideCandidate(id: string, input: ReviewInput, staffId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const candidate = await prisma.libraryCandidate.findUnique({ where: { id }, include: { product: true } });
  if (!candidate) throw new LibraryReviewError("That item was not found.");
  if (candidate.status !== "PENDING") throw new LibraryReviewError("That item was already decided.");
  const decision: LibraryDecision = { candidateId: candidate.remoteId, action: input.action, ...(input.entry ? { entry: input.entry } : {}), ...(input.mergeIntoId ? { mergeIntoId: input.mergeIntoId } : {}) };
  let secrets: ReturnType<typeof secretsOf>;
  try {
    secrets = secretsOf(candidate.product);
  } catch {
    throw new LibraryReviewError("The product's signing secret could not be read. Rotate its secrets.");
  }
  const body = JSON.stringify(decision);
  let response: Response;
  let text: string;
  try {
    response = await fetchImpl(`${candidate.product.baseUrl}/api/ops/library/decisions`, { method: "POST", headers: signedHeaders(secrets.sign, newId("command"), body), body, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
    text = await response.text();
  } catch (error) {
    throw new LibraryReviewError(error instanceof Error ? `Could not reach the product: ${error.message}` : "Could not reach the product.");
  }
  let reply: { error?: string } = {};
  try {
    reply = JSON.parse(text);
  } catch {
    // the status code below is enough
  }
  if (!response.ok) throw new LibraryReviewError(reply.error ?? `The product answered ${response.status}.`);
  const verified = verifyRequest(secrets.accept, response.headers, text);
  if (!verified.ok) throw new LibraryReviewError(`The product's answer was not signed correctly (${verified.reason}).`);

  const status = input.action === "approve" ? "APPROVED" : input.action === "merge" ? "MERGED" : "REJECTED";
  await prisma.libraryCandidate.update({ where: { id }, data: { status, decidedAt: new Date(), decidedById: staffId } });
  await audit({ actorUserId: staffId, action: `library.${input.action}`, subject: candidate.productKey, detail: { name: candidate.name, kind: candidate.kind, ...(input.entry ? { as: input.entry.name } : {}) } });
}

export async function listCandidates(productKey: string, filter: { kind?: string; status?: string } = {}) {
  return prisma.libraryCandidate.findMany({
    where: { productKey, ...(filter.kind ? { kind: filter.kind } : {}), status: (filter.status ?? "PENDING") as never },
    orderBy: [{ kitchenCount: "desc" }, { updatedAt: "desc" }],
    take: 300,
  });
}

export async function countPending(productKey: string): Promise<{ FOOD_ITEM: number; INGREDIENT: number; PHOTO: number }> {
  const rows = await prisma.libraryCandidate.groupBy({ by: ["kind"], where: { productKey, status: "PENDING" }, _count: true });
  const count = (kind: string) => rows.find((r) => r.kind === kind)?._count ?? 0;
  return { FOOD_ITEM: count("FOOD_ITEM"), INGREDIENT: count("INGREDIENT"), PHOTO: count("PHOTO") };
}
