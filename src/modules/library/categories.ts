import "server-only";
import { prisma } from "@/lib/db";
import { normalizeName } from "./match";

/** The library's dish category a typed name refers to (its name or one of its other names, spelling-tolerant: "Starter" finds "Starters"), or null. */
export async function findLibraryCategory(typed: string): Promise<{ id: string; name: string } | null> {
  const key = normalizeName(typed);
  if (!key) return null;
  const all = await prisma.systemFoodCategory.findMany({ select: { id: true, name: true, aliases: true } });
  return all.find((c) => [c.name, ...c.aliases].some((n) => normalizeName(n) === key)) ?? null;
}
