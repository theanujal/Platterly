import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import type { LibraryCandidateDoc, LibraryDecision } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { catalogImage } from "@/modules/menus/catalog/catalog-images";
import { CATEGORY_OPTIONS, normalizeCategory, normalizeUnit } from "@/modules/inventory/options";
import { normalizeName } from "./match";
import { MIN_KITCHENS } from "./scan";

export class LibraryError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
  }
}

/** The pending candidates Ops should show: enough kitchens, newest and biggest first. Names, category, type, unit and a count only. */
export async function candidatesForOps(minKitchens: number = MIN_KITCHENS): Promise<LibraryCandidateDoc[]> {
  const rows = await prisma.libraryCandidate.findMany({
    where: { status: "PENDING", kitchenCount: { gte: minKitchens } },
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
    photoUrl: null, // pictures come in with the photo step
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

  if (candidate.kind === "PHOTO") throw new LibraryError("Photo candidates are not supported yet.", 501);
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
    const categoryName = (entry?.categoryName ?? candidate.categoryName ?? "").trim();
    const foodType = entry?.foodType ?? candidate.foodType;
    if (!categoryName) throw new LibraryError("Choose a category.", 400);
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
