import "server-only";
import { prisma } from "@/lib/db";
import { normalizeCategory, normalizeUnit } from "@/modules/inventory/options";
import { buildLibraryIndex, findLibraryMatch, isJunkName, normalizeName } from "./match";
import type { FoodType, LibraryCandidateKind } from "@/generated/prisma/enums";

/** A name must be on this many different kitchens' lists before a reviewer sees it (filters junk and one kitchen's private dishes). */
export const MIN_KITCHENS = Number(process.env.LIBRARY_MIN_KITCHENS) > 0 ? Number(process.env.LIBRARY_MIN_KITCHENS) : 2;
/**
 * A dish's own uploaded picture is offered once this many different kitchens have one for it. Lower than the name rule because
 * the library dish already exists (nothing new is revealed), and a person looks at every photo before it is used.
 */
export const PHOTO_MIN_KITCHENS = Number(process.env.LIBRARY_PHOTO_MIN_KITCHENS) > 0 ? Number(process.env.LIBRARY_PHOTO_MIN_KITCHENS) : 1;
const SCAN_EVERY_MS = 20 * 60 * 60 * 1000;
const MAX_ROWS = 50_000;

interface Row {
  recordId: string;
  organizationId: string;
  name: string;
  categoryName: string | null;
  foodType: FoodType | null;
  unit: string | null;
}

const mostCommon = <T>(values: T[]): T | null => {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/** The word-sorted normalized name: the same key the matcher uses, so "Butter Paneer Masala" and "Paneer Butter Masala" group together. */
const groupKey = (name: string) => normalizeName(name).split(" ").sort().join(" ");

async function foodRows(organizationIds?: string[]): Promise<Row[]> {
  const items = await prisma.menuItem.findMany({
    where: { sourceCatalogId: null, ...(organizationIds ? { organizationId: { in: organizationIds } } : {}) },
    select: { id: true, organizationId: true, name: true, foodType: true, categories: { select: { category: { select: { name: true } } }, take: 1 } },
    take: MAX_ROWS,
    orderBy: { id: "asc" },
  });
  return items.map((i) => ({ recordId: i.id, organizationId: i.organizationId, name: i.name, categoryName: i.categories[0]?.category.name ?? null, foodType: i.foodType, unit: null }));
}

async function ingredientRows(organizationIds?: string[]): Promise<Row[]> {
  const items = await prisma.inventory.findMany({
    where: organizationIds ? { organizationId: { in: organizationIds } } : {},
    select: { id: true, organizationId: true, name: true, category: true, unit: true },
    take: MAX_ROWS,
    orderBy: { id: "asc" },
  });
  return items.map((i) => ({ recordId: i.id, organizationId: i.organizationId, name: i.name, categoryName: normalizeCategory(i.category) ?? "Other", foodType: null, unit: normalizeUnit(i.unit) }));
}

/** Groups kitchens' own items by name, drops what the library already has, and keeps a candidate for the rest. Returns how many candidates it touched. */
async function scanKind(kind: LibraryCandidateKind, rows: Row[], minKitchens: number, full: boolean): Promise<number> {
  const library = kind === "FOOD_ITEM" ? await prisma.systemFoodItem.findMany({ select: { id: true, name: true, aliases: true } }) : await prisma.systemIngredient.findMany({ select: { id: true, name: true, aliases: true } });
  const index = buildLibraryIndex(library);

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    if (isJunkName(row.name)) continue;
    const key = groupKey(row.name);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  let touched = 0;
  const seen = new Set<string>();
  for (const [key, members] of groups) {
    const display = mostCommon(members.map((m) => m.name.trim())) ?? members[0].name;
    const match = findLibraryMatch(display, index);
    if (match.kind === "exact") continue; // the library already has it
    seen.add(key);
    const existing = await prisma.libraryCandidate.findUnique({ where: { kind_key: { kind, key } } });
    if (existing && existing.status !== "PENDING") continue; // decided already: not offered again
    const orgIds = new Set(members.map((m) => m.organizationId));
    if (!existing && orgIds.size < minKitchens) continue;

    const data = {
      name: display,
      categoryName: mostCommon(members.map((m) => m.categoryName).filter((c): c is string => !!c)),
      foodType: mostCommon(members.map((m) => m.foodType).filter((t): t is FoodType => !!t)),
      unit: mostCommon(members.map((m) => m.unit).filter((u): u is string => !!u)),
      kitchenCount: orgIds.size,
      suggestedMatchId: match.kind === "close" ? match.entry.id : null,
      suggestedMatchName: match.kind === "close" ? match.entry.name : null,
    };
    const candidate = existing
      ? await prisma.libraryCandidate.update({ where: { id: existing.id }, data })
      : await prisma.libraryCandidate.create({ data: { kind, key, ...data } });
    // the sources are exactly the records that have this name now
    await prisma.libraryCandidateSource.deleteMany({ where: { candidateId: candidate.id, recordId: { notIn: members.map((m) => m.recordId) } } });
    await prisma.libraryCandidateSource.createMany({ data: members.map((m) => ({ candidateId: candidate.id, organizationId: m.organizationId, recordId: m.recordId })), skipDuplicates: true });
    touched++;
  }

  // A pending candidate nobody has any more (items renamed or deleted) is emptied, so it drops off the reviewer's list.
  // Only on a full scan: a scan limited to some kitchens cannot tell who else still has the name.
  if (full) {
    const pending = await prisma.libraryCandidate.findMany({ where: { kind, status: "PENDING", kitchenCount: { gt: 0 } }, select: { id: true, key: true } });
    for (const c of pending) {
      if (seen.has(c.key)) continue;
      await prisma.libraryCandidateSource.deleteMany({ where: { candidateId: c.id } });
      await prisma.libraryCandidate.update({ where: { id: c.id }, data: { kitchenCount: 0 } });
    }
  }
  return touched;
}

/**
 * Photo candidates: for each library dish that has only an illustration, the pictures kitchens uploaded themselves
 * (`imageSource = "upload"`) for a dish with exactly that name or one of its other names. One candidate per library dish, keyed by
 * the dish's id, pointing at the most recently updated picture. Only exact name matches count: a "close" name may be another dish.
 */
async function scanPhotos(organizationIds: string[] | undefined, minKitchens: number, full: boolean): Promise<number> {
  const dishes = await prisma.systemFoodItem.findMany({ where: { isActive: true, imageCredit: null }, select: { id: true, name: true, aliases: true, categoryName: true, foodType: true } });
  const index = buildLibraryIndex(dishes);
  const items = await prisma.menuItem.findMany({
    where: { imageSource: "upload", image: { startsWith: "/uploads/" }, ...(organizationIds ? { organizationId: { in: organizationIds } } : {}) },
    select: { id: true, organizationId: true, name: true, image: true, updatedAt: true },
    take: MAX_ROWS,
    orderBy: { id: "asc" },
  });

  const byDish = new Map<string, typeof items>();
  for (const item of items) {
    const match = findLibraryMatch(item.name, index);
    if (match.kind !== "exact") continue;
    byDish.set(match.entry.id, [...(byDish.get(match.entry.id) ?? []), item]);
  }

  let touched = 0;
  const seen = new Set<string>();
  for (const [dishId, members] of byDish) {
    const dish = dishes.find((d) => d.id === dishId)!;
    const orgIds = new Set(members.map((m) => m.organizationId));
    const existing = await prisma.libraryCandidate.findUnique({ where: { kind_key: { kind: "PHOTO", key: dishId } } });
    if (existing && existing.status !== "PENDING") continue; // decided already: not offered again
    if (!existing && orgIds.size < minKitchens) continue;
    seen.add(dishId);
    const newest = [...members].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    const data = { name: dish.name, categoryName: dish.categoryName, foodType: dish.foodType, photoUrl: newest.image, kitchenCount: orgIds.size, suggestedMatchId: dish.id, suggestedMatchName: dish.name };
    const candidate = existing ? await prisma.libraryCandidate.update({ where: { id: existing.id }, data }) : await prisma.libraryCandidate.create({ data: { kind: "PHOTO", key: dishId, ...data } });
    await prisma.libraryCandidateSource.deleteMany({ where: { candidateId: candidate.id, recordId: { notIn: members.map((m) => m.id) } } });
    await prisma.libraryCandidateSource.createMany({ data: members.map((m) => ({ candidateId: candidate.id, organizationId: m.organizationId, recordId: m.id })), skipDuplicates: true });
    touched++;
  }

  // A pending photo nobody has any more (picture replaced or removed, dish renamed, or the library dish now has a real photo) drops off the list.
  if (full) {
    const pending = await prisma.libraryCandidate.findMany({ where: { kind: "PHOTO", status: "PENDING", kitchenCount: { gt: 0 } }, select: { id: true, key: true } });
    for (const c of pending) {
      if (seen.has(c.key)) continue;
      await prisma.libraryCandidateSource.deleteMany({ where: { candidateId: c.id } });
      await prisma.libraryCandidate.update({ where: { id: c.id }, data: { kitchenCount: 0 } });
    }
  }
  return touched;
}

/**
 * Category candidates: category names two or more kitchens use for their own dishes that the library's category list lacks (by name
 * or another name; "Starter" counts as "Starters"). A person approves one as a new library category, merges it into an existing one,
 * or rejects it. Only the name and a count are kept.
 */
async function scanCategories(organizationIds: string[] | undefined, minKitchens: number, full: boolean): Promise<number> {
  const library = await prisma.systemFoodCategory.findMany({ select: { id: true, name: true, aliases: true } });
  const index = buildLibraryIndex(library);
  const categories = await prisma.menuCategory.findMany({
    where: organizationIds ? { organizationId: { in: organizationIds } } : {},
    select: { id: true, organizationId: true, name: true },
    take: MAX_ROWS,
    orderBy: { id: "asc" },
  });

  const groups = new Map<string, typeof categories>();
  for (const row of categories) {
    if (isJunkName(row.name)) continue;
    const key = groupKey(row.name);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  let touched = 0;
  const seen = new Set<string>();
  for (const [key, members] of groups) {
    const display = mostCommon(members.map((m) => m.name.trim())) ?? members[0].name;
    const match = findLibraryMatch(display, index);
    if (match.kind === "exact") continue; // the library already has it
    seen.add(key);
    const existing = await prisma.libraryCandidate.findUnique({ where: { kind_key: { kind: "CATEGORY", key } } });
    if (existing && existing.status !== "PENDING") continue;
    const orgIds = new Set(members.map((m) => m.organizationId));
    if (!existing && orgIds.size < minKitchens) continue;
    const data = { name: display, kitchenCount: orgIds.size, suggestedMatchId: match.kind === "close" ? match.entry.id : null, suggestedMatchName: match.kind === "close" ? match.entry.name : null };
    const candidate = existing ? await prisma.libraryCandidate.update({ where: { id: existing.id }, data }) : await prisma.libraryCandidate.create({ data: { kind: "CATEGORY", key, ...data } });
    await prisma.libraryCandidateSource.deleteMany({ where: { candidateId: candidate.id, recordId: { notIn: members.map((m) => m.id) } } });
    await prisma.libraryCandidateSource.createMany({ data: members.map((m) => ({ candidateId: candidate.id, organizationId: m.organizationId, recordId: m.id })), skipDuplicates: true });
    touched++;
  }

  if (full) {
    const pending = await prisma.libraryCandidate.findMany({ where: { kind: "CATEGORY", status: "PENDING", kitchenCount: { gt: 0 } }, select: { id: true, key: true } });
    for (const c of pending) {
      if (seen.has(c.key)) continue;
      await prisma.libraryCandidateSource.deleteMany({ where: { candidateId: c.id } });
      await prisma.libraryCandidate.update({ where: { id: c.id }, data: { kitchenCount: 0 } });
    }
  }
  return touched;
}

/**
 * The nightly library scan (AJ, 2026-10-11). Looks at what kitchens added on their own and keeps a candidate for each name
 * the library lacks, for a person to review in Ops. Reads names, category, Veg/Non-Veg and unit only. Idempotent.
 * `organizationIds` limits it to those kitchens (tests); production passes none.
 */
export async function runLibraryScan(options: { organizationIds?: string[]; minKitchens?: number; minPhotoKitchens?: number } = {}): Promise<{ scanned: number; candidates: number }> {
  const minKitchens = options.minKitchens ?? MIN_KITCHENS;
  const [food, ingredients] = await Promise.all([foodRows(options.organizationIds), ingredientRows(options.organizationIds)]);
  const candidates =
    (await scanKind("FOOD_ITEM", food, minKitchens, !options.organizationIds)) +
    (await scanKind("INGREDIENT", ingredients, minKitchens, !options.organizationIds)) +
    (await scanPhotos(options.organizationIds, options.minPhotoKitchens ?? PHOTO_MIN_KITCHENS, !options.organizationIds)) +
    (await scanCategories(options.organizationIds, minKitchens, !options.organizationIds));
  return { scanned: food.length + ingredients.length, candidates };
}

/** Runs the scan at most about once a day, however often the cron route is called. */
export async function runLibraryScanIfDue(now: Date = new Date()): Promise<{ ran: boolean; scanned: number; candidates: number }> {
  const last = await prisma.libraryScanRun.findFirst({ orderBy: { startedAt: "desc" } });
  if (last && now.getTime() - last.startedAt.getTime() < SCAN_EVERY_MS) return { ran: false, scanned: 0, candidates: 0 };
  const run = await prisma.libraryScanRun.create({ data: { startedAt: now } });
  const result = await runLibraryScan();
  await prisma.libraryScanRun.update({ where: { id: run.id }, data: result });
  return { ran: true, ...result };
}
