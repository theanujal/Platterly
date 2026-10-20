import "server-only";
import { newId, parseLibraryCandidates, parseLibraryEntries, requestTarget, signedHeaders, verifyRequest, type LibraryDecision, type LibraryEntryDoc, type LibraryEntryUpdate } from "@platterly/contract";
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
    const url = `${product.baseUrl}/api/ops/library/candidates`;
    const response = await fetchImpl(url, { method: "GET", headers: signedHeaders(secrets.sign, newId("command"), "", { target: requestTarget("GET", url) }), signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
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
    const url = `${candidate.product.baseUrl}/api/ops/library/decisions`;
    response = await fetchImpl(url, { method: "POST", headers: signedHeaders(secrets.sign, newId("command"), body, { target: requestTarget("POST", url) }), body, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
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

export async function countPending(productKey: string): Promise<{ FOOD_ITEM: number; INGREDIENT: number; PHOTO: number; CATEGORY: number }> {
  const rows = await prisma.libraryCandidate.groupBy({ by: ["kind"], where: { productKey, status: "PENDING" }, _count: true });
  const count = (kind: string) => rows.find((r) => r.kind === kind)?._count ?? 0;
  return { FOOD_ITEM: count("FOOD_ITEM"), INGREDIENT: count("INGREDIENT"), PHOTO: count("PHOTO"), CATEGORY: count("CATEGORY") };
}

/** One signed call to a product's library routes; returns the verified, parsed answer or throws a reason a person can read. */
async function callProduct(productKey: string, path: string, method: "GET" | "POST", body: string, fetchImpl: typeof fetch): Promise<unknown> {
  const product = await prisma.product.findUnique({ where: { key: productKey } });
  if (!product || product.status !== "ACTIVE") throw new LibraryReviewError("This product is not active.");
  let secrets: ReturnType<typeof secretsOf>;
  try {
    secrets = secretsOf(product);
  } catch {
    throw new LibraryReviewError("The product's signing secret could not be read. Rotate its secrets.");
  }
  let response: Response;
  let text: string;
  try {
    const url = `${product.baseUrl}${path}`;
    response = await fetchImpl(url, { method, headers: signedHeaders(secrets.sign, newId("command"), body, { target: requestTarget(method, url) }), ...(method === "POST" ? { body } : {}), signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
    text = await response.text();
  } catch (error) {
    throw new LibraryReviewError(error instanceof Error ? `Could not reach the product: ${error.message}` : "Could not reach the product.");
  }
  let json: { error?: string } = {};
  try {
    json = JSON.parse(text);
  } catch {
    // the status code below is enough
  }
  if (!response.ok) throw new LibraryReviewError(response.status === 404 ? "This product has no library editor." : (json.error ?? `The product answered ${response.status}.`));
  const verified = verifyRequest(secrets.accept, response.headers, text);
  if (!verified.ok) throw new LibraryReviewError(`The product's answer was not signed correctly (${verified.reason}).`);
  return json;
}

/** The product's library entries of one kind, read live (Ops keeps no copy: the product's library is the single source). */
export async function fetchLibraryEntries(productKey: string, kind: "FOOD_ITEM" | "INGREDIENT" | "CATEGORY", fetchImpl: typeof fetch = fetch): Promise<LibraryEntryDoc[]> {
  const json = await callProduct(productKey, `/api/ops/library/entries?kind=${kind}`, "GET", "", fetchImpl);
  const parsed = parseLibraryEntries(json);
  if (!parsed.ok) throw new LibraryReviewError(`The list is invalid: ${parsed.error}.`);
  return parsed.value.entries;
}

/** Sends one change to a library entry; the product applies it, and the change is recorded in Ops' audit log only after a signed 2xx. */
export async function updateLibraryEntry(productKey: string, update: LibraryEntryUpdate, staffId: string, label: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await callProduct(productKey, "/api/ops/library/entries", "POST", JSON.stringify(update), fetchImpl);
  await audit({ actorUserId: staffId, action: "library.entry.update", subject: productKey, detail: { kind: update.kind, entry: label, changes: { ...update, id: undefined, kind: undefined } } });
}

/** The library entry a reviewer typed for a candidate (its name or one of its other names, case ignored), looked up in the candidate's own product and kind; throws when none or more than one matches. */
export async function findEntryByName(candidateId: string, typed: string, fetchImpl: typeof fetch = fetch): Promise<LibraryEntryDoc> {
  const candidate = await prisma.libraryCandidate.findUnique({ where: { id: candidateId }, select: { productKey: true, kind: true } });
  if (!candidate) throw new LibraryReviewError("That item was not found.");
  if (candidate.kind !== "FOOD_ITEM" && candidate.kind !== "INGREDIENT" && candidate.kind !== "CATEGORY") throw new LibraryReviewError("This kind of item cannot be merged.");
  const { productKey, kind } = candidate;
  const key = typed.trim().toLowerCase();
  if (!key) throw new LibraryReviewError("Type the name of the library item to merge into.");
  const entries = await fetchLibraryEntries(productKey, kind, fetchImpl);
  const exact = entries.filter((e) => e.name.toLowerCase() === key);
  const found = exact.length > 0 ? exact : entries.filter((e) => e.aliases.some((a) => a.toLowerCase() === key));
  if (found.length === 0) throw new LibraryReviewError(`"${typed.trim()}" is not in the library. Pick a name from the list.`);
  if (found.length > 1) throw new LibraryReviewError(`More than one library item is called "${typed.trim()}".`);
  return found[0];
}
