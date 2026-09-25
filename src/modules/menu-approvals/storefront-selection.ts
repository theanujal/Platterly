// Client-safe (no "server-only", no Prisma). The single definition of "which
// of a visitor's picks are extras" — the storefront UI uses it to show the
// counters and the Extra Item popup, and `storefront-draft.ts` re-runs the
// very same function on the server, so the two can never disagree.

export interface SelectableSection {
  maxSelection: number | null;
  items: { id: string }[];
}

export interface PickSplit {
  regularIds: string[];
  extraIds: string[];
  /** Picks that aren't offered in any section (server rejects these). */
  unknownIds: string[];
  /** Index of the section each known pick counts against. */
  sectionOfItem: Map<string, number>;
}

/**
 * Within each section the first `maxSelection` picks (in pick order) are
 * included in the plate price; any beyond are extras. An item that sits in
 * several categories counts against the first section it appears in.
 */
export function splitPicks(sections: SelectableSection[], pickedIds: string[]): PickSplit {
  const sectionOfItem = new Map<string, number>();
  sections.forEach((section, index) => {
    for (const item of section.items) {
      if (!sectionOfItem.has(item.id)) sectionOfItem.set(item.id, index);
    }
  });

  const regularIds: string[] = [];
  const extraIds: string[] = [];
  const unknownIds: string[] = [];
  const counts = new Map<number, number>();
  for (const id of pickedIds) {
    const sectionIndex = sectionOfItem.get(id);
    if (sectionIndex === undefined) {
      unknownIds.push(id);
      continue;
    }
    const count = (counts.get(sectionIndex) ?? 0) + 1;
    counts.set(sectionIndex, count);
    const cap = sections[sectionIndex].maxSelection;
    (cap !== null && count > cap ? extraIds : regularIds).push(id);
  }
  return { regularIds, extraIds, unknownIds, sectionOfItem };
}
