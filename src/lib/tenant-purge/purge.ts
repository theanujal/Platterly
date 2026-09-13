import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { TENANT_SCOPED_DELEGATES } from "./tenant-scoped-models";

export class ConfirmationMismatchError extends Error {}

const REQUIRED_CONFIRMATION_PHRASE = "DELETE";

/**
 * Chunk 5 Group 5.4 — "Delete All Data". Keeps the Organization row and its
 * team/billing/audit history (see `PURGE_EXEMPT_MODELS`), wipes everything
 * else tenant-scoped. The audit entry is written BEFORE the purge runs (per
 * spec) and survives it, since `AuditLog` is itself exempt.
 */
export async function purgeTenantData(organizationId: string, actorUserId: string, typedConfirmation: string) {
  if (typedConfirmation.trim() !== REQUIRED_CONFIRMATION_PHRASE) {
    throw new ConfirmationMismatchError(`Type "${REQUIRED_CONFIRMATION_PHRASE}" exactly to confirm.`);
  }

  await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

  await audit({
    organizationId,
    actorUserId,
    action: "tenant.data_purge",
    recordType: "Organization",
    recordId: organizationId,
    before: { purgedModels: TENANT_SCOPED_DELEGATES },
  });

  await prisma.$transaction(
    TENANT_SCOPED_DELEGATES.map((delegate) =>
      // Each delegate's `deleteMany` has an incompatible generic signature
      // from the others' — TS can't call a union of them uniformly. The
      // `{ where: { organizationId } }` shape is valid on every model in
      // this list (all have a real `organizationId` column); the cast is
      // narrowly scoped to this one indexed call, not the module's types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any)[delegate].deleteMany({ where: { organizationId } }),
    ),
  );
}
