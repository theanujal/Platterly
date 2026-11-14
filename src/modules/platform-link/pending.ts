import "server-only";
import { prisma } from "@/lib/db";
import { lockMemberPair } from "@/lib/member-lock/with-member-lock";
import { settleOldAdmins } from "./membership";
import { normalizePhone } from "@/lib/phone";
import { ensureTrialPlan } from "@/modules/subscriptions/trial-plan";
import { assignPlan } from "@/modules/subscriptions/subscription";
import { opsBillingOn } from "@/modules/ops-link/config";
import { emitBusinessSignedUp } from "@/modules/ops-link/events";

/** True when the Platform already made this person a member of a business (so a brand-new Caterly user must not get a tenant of their own). */
export async function hasPendingMembership(subject: string): Promise<boolean> {
  return (await prisma.platformPendingMember.findUnique({ where: { subject }, select: { subject: true } })) !== null;
}

/**
 * At a person's first central sign-in (their account row has just been created): join the business the Platform made them a member of. Does nothing when
 * there is no pending row, the business is not linked here yet, or the person already belongs to a business here (the row stays for a human to settle).
 * Returns whether a membership was created.
 */
export async function consumePendingMembership(userId: string, subject: string): Promise<boolean> {
  const joined = await joinPendingMembership(userId, subject);
  if (joined) await afterOwnerJoined(userId, joined);
  return joined !== null;
}

/**
 * The business the Platform made for this person (single sign-up) was empty when it arrived. Once its owner has joined it gets what a kitchen that signed up here
 * would have had: the owner's name and phone, the trial (when billing is not Ops's), and the sign-up message that starts the trial in Ops. Never fails the sign-in.
 */
async function afterOwnerJoined(userId: string, joined: { organizationId: string; role: string }): Promise<void> {
  if (joined.role !== "owner") return;
  try {
    const [org, user] = await Promise.all([
      prisma.organization.findUnique({ where: { id: joined.organizationId }, select: { id: true, ownerFirstName: true, ownerLastName: true, contactPhone: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, phone: true } }),
    ]);
    if (!org || !user) return;
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        ...(org.ownerFirstName ? {} : { ownerFirstName: user.firstName }),
        ...(org.ownerLastName ? {} : { ownerLastName: user.lastName }),
        ...(org.contactPhone || !user.phone ? {} : { contactPhone: normalizePhone(user.phone) }),
      },
    });
    if (!opsBillingOn() && !(await prisma.subscription.findFirst({ where: { organizationId: org.id, endDate: null }, select: { id: true } }))) {
      const trialPlan = await ensureTrialPlan();
      await assignPlan(org.id, trialPlan.id, userId);
    }
    void emitBusinessSignedUp(org.id).catch(() => undefined);
  } catch (error) {
    console.error("[platform-link] could not finish setting up the adopted business:", error instanceof Error ? error.message : "unknown");
  }
}

async function joinPendingMembership(userId: string, subject: string): Promise<{ organizationId: string; role: string } | null> {
  const pending = await prisma.platformPendingMember.findUnique({ where: { subject } });
  if (!pending) return null;
  const org = await prisma.organization.findUnique({ where: { businessId: pending.businessId }, select: { id: true } });
  if (!org) return null;
  return prisma.$transaction(async (tx) => {
    await lockMemberPair(tx, userId, org.id);
    if (await tx.member.findFirst({ where: { userId }, select: { id: true } })) return null;
    await tx.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId, role: pending.role, createdAt: new Date(), disabledAt: pending.disabled ? new Date() : null } });
    await tx.platformPendingMember.delete({ where: { subject } });
    if (pending.role === "owner") {
      // The new Admin has arrived: the parked Old Admin steps down, and any other owner becomes a manager (one Admin).
      await settleOldAdmins(tx, org.id, pending.businessId, userId);
      await tx.member.updateMany({ where: { organizationId: org.id, role: "owner", NOT: { userId } }, data: { role: "manager" } });
    }
    return { organizationId: org.id, role: pending.role };
  });
}
