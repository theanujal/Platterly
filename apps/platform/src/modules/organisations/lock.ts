import type { Prisma } from "@/generated/prisma/client";
import { OneOrganisationPerTransactionError, OrganisationNotFoundError } from "./errors";

// F3.2.2 `lockOrganisation` (W1 clarification B2): SELECT ... FOR UPDATE on the organisation row. It records the organisation in the transaction
// and throws if a DIFFERENT organisation is locked later in the same transaction (one transaction changes one organisation, which keeps the
// database triggers' own row locks from deadlocking). The lock is held to commit or rollback.
export type LockTx = Pick<Prisma.TransactionClient, "$queryRaw">;
export type LockedOrganisation = { id: string; status: string; adminEstablished: boolean; linkEstablished: boolean };

const held = new WeakMap<object, string>();

export async function lockOrganisation(tx: LockTx, organisationId: string): Promise<LockedOrganisation> {
  const current = held.get(tx);
  if (current !== undefined && current !== organisationId) {
    throw new OneOrganisationPerTransactionError(`this transaction already changes ${current}; it cannot also change ${organisationId}`);
  }
  const rows = await tx.$queryRaw<LockedOrganisation[]>`
    select id, status, admin_established as "adminEstablished", link_established as "linkEstablished"
    from organisations where id = ${organisationId} for update`;
  if (rows.length === 0) throw new OrganisationNotFoundError(`organisation ${organisationId} does not exist`);
  held.set(tx, organisationId);
  return rows[0];
}
