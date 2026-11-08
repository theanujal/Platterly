import "server-only";
import type { MembershipChangedData } from "@platterly/platform-contract";
import type { Prisma } from "@/generated/prisma/client";
import { lockMemberPair } from "@/lib/member-lock/with-member-lock";
import { PLATFORM_PROVIDER_ID } from "@/lib/platform/config";

type Tx = Pick<Prisma.TransactionClient, "organization" | "account" | "member" | "session" | "platformPendingMember" | "$executeRaw">;

export type MembershipResult = { ok: true } | { ok: false; status: 409; error: "business_not_linked" | "subject_missing" | "person_in_another_business" };

/** The Platform's one central role is `admin`; in Caterly that is the `owner` (shown as Admin). Nothing else is ever granted from the centre. */
const caterlyRole = (central: string) => (central === "admin" ? "owner" : "staff");

/**
 * `membership.changed`, applied to Caterly's Member table inside the event's transaction (a refusal rolls it all back and the sender retries).
 *  - active: join (new members get `staff`, the central `admin` becomes `owner`); a disabled member is re-enabled. An existing member's role is never
 *    changed by this event, except that the central admin is the owner. When the owner changes, any other owner becomes a manager (one Admin).
 *  - disabled: the member keeps the seat, the existing "disabled" flag is set.
 *  - removed: the Member row is deleted and the person's Caterly sessions end; records they made stay.
 * A person with no Caterly user yet is stored as a pending member and joins at their first central sign-in.
 * Refused with 409 (and so retried, then visible as a stuck event on the Platform) when the business is not linked yet, when the event does not say who
 * the person is, or when the person already belongs to a DIFFERENT business here: a human has to settle that, it is never overwritten.
 */
export async function applyMembership(tx: Tx, businessId: string, data: MembershipChangedData): Promise<MembershipResult> {
  if (!data.subject) return { ok: false, status: 409, error: "subject_missing" };
  const org = await tx.organization.findUnique({ where: { businessId }, select: { id: true } });
  if (!org) return { ok: false, status: 409, error: "business_not_linked" };
  const account = await tx.account.findFirst({ where: { providerId: PLATFORM_PROVIDER_ID, accountId: data.subject }, select: { userId: true } });
  const role = caterlyRole(data.role);

  if (!account) {
    // No Caterly user for this person yet.
    if (data.status === "removed") await tx.platformPendingMember.deleteMany({ where: { subject: data.subject, businessId } });
    else await tx.platformPendingMember.upsert({ where: { subject: data.subject }, create: { subject: data.subject, businessId, role, disabled: data.status === "disabled" }, update: { businessId, role, disabled: data.status === "disabled" } });
    return { ok: true };
  }

  const userId = account.userId;
  await lockMemberPair(tx, userId, org.id);
  const member = await tx.member.findFirst({ where: { organizationId: org.id, userId } });

  if (data.status === "removed") {
    if (member) {
      await tx.member.deleteMany({ where: { organizationId: org.id, userId } });
      await tx.session.deleteMany({ where: { userId } });
    }
    return { ok: true };
  }
  if (data.status === "disabled") {
    if (member && !member.disabledAt) await tx.member.update({ where: { id: member.id }, data: { disabledAt: new Date() } });
    return { ok: true };
  }

  // active
  if (!member) {
    const elsewhere = await tx.member.findFirst({ where: { userId, NOT: { organizationId: org.id } }, select: { id: true } });
    if (elsewhere) return { ok: false, status: 409, error: "person_in_another_business" };
    await tx.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId, role, createdAt: new Date() } });
  } else {
    const promote = role === "owner" && member.role !== "owner";
    if (member.disabledAt || promote) await tx.member.update({ where: { id: member.id }, data: { disabledAt: null, ...(promote ? { role: "owner" } : {}) } });
  }
  if (role === "owner") await tx.member.updateMany({ where: { organizationId: org.id, role: "owner", NOT: { userId } }, data: { role: "manager" } });
  await tx.platformPendingMember.deleteMany({ where: { subject: data.subject } });
  return { ok: true };
}
