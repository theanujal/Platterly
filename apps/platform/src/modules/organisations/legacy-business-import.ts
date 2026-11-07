import { isId } from "@platterly/contract";
import type { Prisma } from "@/generated/prisma/client";
import { createOrganisation } from "./create";
import type { Context } from "./errors";

// Imports Caterly businesses (the Platform organisation id is Caterly's businessId) from a COPY of Caterly's organization, member and user tables into Platform organisations.
// Rules (AJ, 2026-11-07): one Admin per business; disabled members are skipped; non-owner members are not Platform members: they are listed read-only (organisation_team_members) for the Account Business page.
// The Admin is the oldest active owner. A business whose owner has no Platform user yet (never signed in) waits and is picked up on a later run.
// Safe to repeat: createOrganisation is idempotent per Caterly organisation id (the key is `caterly-<id>`). legacy_mappings only accepts kind 'user', so no
// business mapping row is written (that would need a schema change).
// The report holds counts and Caterly ids only, no email address.

export type SourceOrganisation = { id: string; name: string; businessId: string | null };
export type SourceMember = { id: string; organizationId: string; userId: string; role: string; createdAt: Date; disabledAt: Date | null };
export type SourceUser = { id: string; name: string; email: string };
export type ImportReport = {
  sourceOrganisations: number;
  created: number;
  alreadyImported: number;
  waitingForFirstSignIn: string[];
  noActiveOwner: string[];
  noBusinessId: string[];
  refused: { organisationId: string; code: string }[];
  skippedDisabledMembers: number;
  teamListed: number;
};

export const PRODUCT_KEY = "caterly";

export async function importCaterlyBusinesses(
  tx: Prisma.TransactionClient,
  input: { organisations: SourceOrganisation[]; members: SourceMember[]; users: SourceUser[]; batchId: string },
): Promise<ImportReport> {
  const ctx: Context = { initiator: { kind: "system", ref: "caterly-business-import" }, executor: { kind: "system", ref: input.batchId } };
  const emailOf = new Map(input.users.map((u) => [u.id, u.email.trim().toLowerCase()]));
  const report: ImportReport = { sourceOrganisations: input.organisations.length, created: 0, alreadyImported: 0, waitingForFirstSignIn: [], noActiveOwner: [], noBusinessId: [], refused: [], skippedDisabledMembers: 0, teamListed: 0 };

  for (const org of input.organisations) {
    // The Platform business takes Caterly's own businessId, so Platform and Ops share one id. A business without a valid one is not imported.
    if (!isId("business", org.businessId)) {
      report.noBusinessId.push(org.id);
      continue;
    }
    const members = input.members.filter((m) => m.organizationId === org.id);
    report.skippedDisabledMembers += members.filter((m) => m.disabledAt !== null).length;
    const active = members.filter((m) => m.disabledAt === null);
    const owners = active.filter((m) => m.role === "owner").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const owner = owners[0];
    if (!owner) {
      report.noActiveOwner.push(org.id);
      continue;
    }
    const email = emailOf.get(owner.userId);
    const user = email ? await tx.user.findFirst({ where: { email }, select: { id: true } }) : null;
    if (!user) {
      report.waitingForFirstSignIn.push(org.id);
      continue;
    }
    const result = await createOrganisation(tx, ctx, { userId: user.id, idempotencyKey: `caterly-${org.id}`, name: org.name, productKey: PRODUCT_KEY, organisationId: org.businessId });
    if (!result.ok) {
      report.refused.push({ organisationId: org.id, code: result.code });
      continue;
    }
    if (result.created) report.created++;
    else report.alreadyImported++;
    // Everyone active who is not the chosen Admin is shown on the business as a read-only team list (a second owner is listed with the role "owner").
    for (const m of active.filter((x) => x.id !== owner.id)) {
      const person = input.users.find((u) => u.id === m.userId);
      if (!person) continue;
      await tx.organisationTeamMember.upsert({
        where: { organisationId_legacyMemberId: { organisationId: result.organisationId, legacyMemberId: m.id } },
        create: { organisationId: result.organisationId, legacyMemberId: m.id, name: person.name || person.email, email: person.email.trim().toLowerCase(), role: m.role },
        update: { name: person.name || person.email, role: m.role },
      });
      report.teamListed++;
    }
  }
  return report;
}
