import "server-only";
import { prisma } from "@/lib/db";
import { normalizeCategory, normalizeUnit } from "@/modules/inventory/options";
import { buildLibraryIndex, findLibraryMatch, isJunkName, normalizeName } from "./match";
import type { FoodType, LibraryCandidateKind } from "@/generated/prisma/enums";

/** A name must be on this many different kitchens' lists before a reviewer sees it (filters junk and one kitchen's private dishes). */
export const MIN_KITCHENS = Number(process.env.LIBRARY_MIN_KITCHENS) > 0 ? Number(process.env.LIBRARY_MIN_KITCHENS) : 2;
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
 * The nightly library scan (AJ, 2026-10-11). Looks at what kitchens added on their own and keeps a candidate for each name
 * the library lacks, for a person to review in Ops. Reads names, category, Veg/Non-Veg and unit only. Idempotent.
 * `organizationIds` limits it to those kitchens (tests); production passes none.
 */
export async function runLibraryScan(options: { organizationIds?: string[]; minKitchens?: number } = {}): Promise<{ scanned: number; candidates: number }> {
  const minKitchens = options.minKitchens ?? MIN_KITCHENS;
  const [food, ingredients] = await Promise.all([foodRows(options.organizationIds), ingredientRows(options.organizationIds)]);
  const candidates = (await scanKind("FOOD_ITEM", food, minKitchens, !options.organizationIds)) + (await scanKind("INGREDIENT", ingredients, minKitchens, !options.organizationIds));
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
