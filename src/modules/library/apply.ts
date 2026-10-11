import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import type { LibraryCandidateDoc, LibraryDecision } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { catalogImage } from "@/modules/menus/catalog/catalog-images";
import { canonicalUrl } from "@/lib/seo/canonical";
import { matchesDeclaredType } from "@/lib/storage/file-signature";
import { getStorageDriver, readStoredFile } from "@/lib/storage/storage";
import { CATEGORY_OPTIONS, normalizeCategory, normalizeUnit } from "@/modules/inventory/options";
import { findLibraryCategory } from "./categories";
import { normalizeName } from "./match";
import { MIN_KITCHENS, PHOTO_MIN_KITCHENS } from "./scan";

export class LibraryError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
  }
}

/** The pending candidates Ops should show: enough kitchens, newest and biggest first. Names, category, type, unit and a count only. */
export async function candidatesForOps(minKitchens: number = MIN_KITCHENS, minPhotoKitchens: number = PHOTO_MIN_KITCHENS): Promise<LibraryCandidateDoc[]> {
  const rows = await prisma.libraryCandidate.findMany({
    where: { status: "PENDING", OR: [{ kind: { not: "PHOTO" }, kitchenCount: { gte: minKitchens } }, { kind: "PHOTO", kitchenCount: { gte: minPhotoKitchens } }] },
    orderBy: [{ kitchenCount: "desc" }, { updatedAt: "desc" }],
    take: 500,
  });
  return rows.map((c) => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    categoryName: c.categoryName,
    foodType: c.foodType,
    unit: c.unit,
    kitchenCount: c.kitchenCount,
    suggestedMatchId: c.suggestedMatchId,
    suggestedMatchName: c.suggestedMatchName,
    photoUrl: c.kind === "PHOTO" && c.photoUrl ? canonicalUrl(c.photoUrl) : null,
    updatedAt: c.updatedAt.toISOString(),
  }));
}

const publicFile = (url: string) => existsSync(path.join(process.cwd(), "public", url));

async function taken(kind: "FOOD_ITEM" | "INGREDIENT", name: string): Promise<boolean> {
  const key = normalizeName(name);
  const items = kind === "FOOD_ITEM" ? await prisma.systemFoodItem.findMany({ select: { name: true, aliases: true } }) : await prisma.systemIngredient.findMany({ select: { name: true, aliases: true } });
  return items.some((i) => [i.name, ...i.aliases].some((n) => normalizeName(n) === key));
}

/**
 * Applies a reviewer's answer to the library (docs/ops-contract.md section 30). Only the library tables and the candidate row
 * change: no kitchen's own item is ever touched. A decision that was already applied answers "already" and does nothing,
 * so Ops can safely send it twice.
 */
export async function applyDecision(decision: LibraryDecision): Promise<"applied" | "already"> {
  const candidate = await prisma.libraryCandidate.findUnique({ where: { id: decision.candidateId } });
  if (!candidate) throw new LibraryError("Unknown candidate.", 404);
  if (candidate.status !== "PENDING") return "already";
  const now = new Date();

  if (decision.action === "reject") {
    await prisma.libraryCandidate.update({ where: { id: candidate.id }, data: { status: "REJECTED", reviewedAt: now } });
    return "applied";
  }

  if (candidate.kind === "PHOTO") return applyPhoto(candidate, decision, now);
  if (candidate.kind === "CATEGORY") return applyCategory(candidate, decision, now);
  const kind = candidate.kind;

  if (decision.action === "merge") {
    const alias = candidate.name.trim();
    if (kind === "FOOD_ITEM") {
      const target = await prisma.systemFoodItem.findUnique({ where: { id: decision.mergeIntoId! } });
      if (!target) throw new LibraryError("The library item to merge into was not found.", 404);
      const has = [target.name, ...target.aliases].some((n) => normalizeName(n) === normalizeName(alias));
      if (!has) await prisma.systemFoodItem.update({ where: { id: target.id }, data: { aliases: { push: alias } } });
    } else {
      const target = await prisma.systemIngredient.findUnique({ where: { id: decision.mergeIntoId! } });
      if (!target) throw new LibraryError("The library item to merge into was not found.", 404);
      const has = [target.name, ...target.aliases].some((n) => normalizeName(n) === normalizeName(alias));
      if (!has) await prisma.systemIngredient.update({ where: { id: target.id }, data: { aliases: { push: alias } } });
    }
    await prisma.libraryCandidate.update({ where: { id: candidate.id }, data: { status: "MERGED", mergedIntoId: decision.mergeIntoId, reviewedAt: now } });
    return "applied";
  }

  // approve as a new library entry
  const entry = decision.entry;
  const name = (entry?.name ?? candidate.name).trim();
  if (await taken(kind, name)) throw new LibraryError(`"${name}" is already in the library. Merge it instead.`, 409);

  if (kind === "FOOD_ITEM") {
    const typedCategory = (entry?.categoryName ?? candidate.categoryName ?? "").trim();
    if (!typedCategory) throw new LibraryError("Choose a category.", 400);
    // A dish's category is one of the library's own categories ("Starter" is taken as "Starters").
    const categoryName = (await findLibraryCategory(typedCategory))?.name;
    if (!categoryName) throw new LibraryError(`"${typedCategory}" is not one of the library's categories. Choose one from the list, or approve it as a category first.`, 400);
    const foodType = entry?.foodType ?? candidate.foodType;
    if (!foodType) throw new LibraryError("Choose Veg or Non-Veg.", 400);
    const last = await prisma.systemFoodItem.aggregate({ _max: { sortOrder: true } });
    let image = catalogImage(name, categoryName).url;
    if (!publicFile(image)) image = catalogImage(name, "Main Course").url;
    await prisma.$transaction([
      prisma.systemFoodItem.create({ data: { name, description: entry?.description ?? null, foodType, categoryName, image, sortOrder: (last._max.sortOrder ?? 0) + 1 } }),
      prisma.libraryCandidate.update({ where: { id: candidate.id }, data: { status: "APPROVED", reviewedAt: now } }),
    ]);
    return "applied";
  }

  const category = normalizeCategory(entry?.categoryName ?? candidate.categoryName ?? "");
  const unit = normalizeUnit(entry?.unit ?? candidate.unit ?? "");
  if (!category) throw new LibraryError(`Category must be one of: ${CATEGORY_OPTIONS.join(", ")}.`, 400);
  if (!unit) throw new LibraryError("Choose a unit.", 400);
  const last = await prisma.systemIngredient.aggregate({ _max: { sortOrder: true } });
  await prisma.$transaction([
    prisma.systemIngredient.create({ data: { name, description: entry?.description ?? null, categoryName: category, unit, sortOrder: (last._max.sortOrder ?? 0) + 1 } }),
    prisma.libraryCandidate.update({ where: { id: candidate.id }, data: { status: "APPROVED", reviewedAt: now } }),
  ]);
  return "applied";
}

const PHOTO_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const LIBRARY_PHOTO_CREDIT = "A photo from a Platterly kitchen";

/**
 * A reviewer approved a kitchen's picture as the library dish's picture. The file is copied into the library's own storage folder
 * (so the kitchen deleting or changing theirs never touches it) and the dish is marked edited so the catalog seed leaves it alone.
 * A dish that already has a real photo is only replaced when the reviewer said so.
 */
async function applyPhoto(candidate: { id: string; key: string; name: string; photoUrl: string | null }, decision: LibraryDecision, now: Date): Promise<"applied"> {
  if (decision.action === "merge") throw new LibraryError("A photo cannot be merged into another item.", 400);
  const dish = await prisma.systemFoodItem.findUnique({ where: { id: candidate.key } });
  if (!dish) throw new LibraryError("The library dish for this photo was not found.", 404);
  if (dish.imageCredit && !decision.replacePhoto) throw new LibraryError(`"${dish.name}" already has a real photo. Choose to replace it, or reject this one.`, 409);

  const extension = candidate.photoUrl ? path.extname(candidate.photoUrl).slice(1).toLowerCase() : "";
  const contentType = PHOTO_TYPES[extension];
  const data = candidate.photoUrl ? await readStoredFile(candidate.photoUrl) : null;
  if (!contentType || !data) throw new LibraryError("The kitchen's picture is no longer available.", 410);
  if (data.length > MAX_PHOTO_BYTES || !matchesDeclaredType(data, contentType)) throw new LibraryError("That file is not a usable PNG, JPG or WebP picture.", 400);

  const uploaded = await getStorageDriver().upload(`library/dishes/${crypto.randomUUID()}.${extension}`, data, contentType);
  try {
    await prisma.$transaction([
      prisma.systemFoodItem.update({ where: { id: dish.id }, data: { image: uploaded.url, imageCredit: LIBRARY_PHOTO_CREDIT, editedInOps: true } }),
      prisma.libraryCandidate.update({ where: { id: candidate.id }, data: { status: "APPROVED", reviewedAt: now } }),
    ]);
  } catch (error) {
    await getStorageDriver().delete(uploaded.key);
    throw error;
  }
  return "applied";
}

/** A reviewer's answer for a kitchen category: add it to the library's categories, make it another name of an existing one, or (reject, handled earlier) drop it. */
async function applyCategory(candidate: { id: string; name: string }, decision: LibraryDecision, now: Date): Promise<"applied"> {
  if (decision.action === "merge") {
    const target = await prisma.systemFoodCategory.findUnique({ where: { id: decision.mergeIntoId! } });
    if (!target) throw new LibraryError("The library category to merge into was not found.", 404);
    const alias = candidate.name.trim();
    if (![target.name, ...target.aliases].some((n) => normalizeName(n) === normalizeName(alias))) await prisma.systemFoodCategory.update({ where: { id: target.id }, data: { aliases: { push: alias } } });
    await prisma.libraryCandidate.update({ where: { id: candidate.id }, data: { status: "MERGED", mergedIntoId: target.id, reviewedAt: now } });
    return "applied";
  }
  const name = (decision.entry?.name ?? candidate.name).trim();
  if (await findLibraryCategory(name)) throw new LibraryError(`"${name}" is already a library category. Merge it instead.`, 409);
  const last = await prisma.systemFoodCategory.aggregate({ _max: { sortOrder: true } });
  await prisma.$transaction([
    prisma.systemFoodCategory.create({ data: { name, sortOrder: (last._max.sortOrder ?? 0) + 1 } }),
    prisma.libraryCandidate.update({ where: { id: candidate.id }, data: { status: "APPROVED", reviewedAt: now } }),
  ]);
  return "applied";
}
