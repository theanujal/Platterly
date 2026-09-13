"use server";

import { headers as nextHeaders } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { disableMember, enableMember } from "@/modules/team/team";
import { getSetting, setSetting } from "@/lib/settings/settings";
import { audit } from "@/lib/audit/audit";
import { TEAM_PRIVACY_KEY, DEFAULT_TEAM_PRIVACY, type TeamPrivacySettings } from "./types";

export type ActionResult = { ok: true } | { ok: false; error: string };

const INVITABLE_ROLES = ["admin", "manager", "staff"] as const;
type InvitableRole = (typeof INVITABLE_ROLES)[number];

function isInvitableRole(role: string): role is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(role);
}

/**
 * Chunk 5 Group 5.2 — role is validated server-side against a fixed literal
 * list, never trusted from the client as-is: a tampered request could
 * otherwise submit "owner" and self-escalate. Uses `auth.api.createInvitation`
 * directly (not a hand-rolled invite record) — its own `invitation:["create"]`
 * check (owner/admin only, per `permissions.ts`) is a second, independent
 * gate beneath our own `requirePermission` call below.
 */
export async function inviteMemberAction(email: string, role: string): Promise<ActionResult> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ users: ["create"] }, organizationId);

  if (!isInvitableRole(role)) {
    return { ok: false, error: "Invalid role." };
  }

  try {
    await auth.api.createInvitation({
      headers: await nextHeaders(),
      body: { email, role, organizationId },
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not send invitation." };
  }

  revalidatePath("/settings/team");
  return { ok: true };
}

export async function resendInvitationAction(email: string, role: string): Promise<ActionResult> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ users: ["create"] }, organizationId);

  if (!isInvitableRole(role)) {
    return { ok: false, error: "Invalid role." };
  }

  try {
    await auth.api.createInvitation({
      headers: await nextHeaders(),
      body: { email, role, organizationId, resend: true },
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not resend invitation." };
  }

  revalidatePath("/settings/team");
  return { ok: true };
}

export async function cancelInvitationAction(invitationId: string): Promise<ActionResult> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ users: ["delete"] }, organizationId);

  try {
    await auth.api.cancelInvitation({ headers: await nextHeaders(), body: { invitationId } });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not cancel invitation." };
  }

  revalidatePath("/settings/team");
  return { ok: true };
}

export async function updateMemberRoleAction(memberId: string, newRole: string): Promise<ActionResult> {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ users: ["edit"] }, organizationId);

  if (!isInvitableRole(newRole)) {
    return { ok: false, error: "Invalid role." };
  }

  try {
    await auth.api.updateMemberRole({
      headers: await nextHeaders(),
      body: { memberId, role: newRole, organizationId },
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update role." };
  }

  revalidatePath("/settings/team");
  return { ok: true };
}

export async function disableMemberAction(memberId: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ users: ["delete"] }, organizationId);

  try {
    await disableMember(organizationId, memberId, session.user.id);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not disable this member." };
  }

  revalidatePath("/settings/team");
  return { ok: true };
}

export async function enableMemberAction(memberId: string): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ users: ["delete"] }, organizationId);

  await enableMember(organizationId, memberId, session.user.id);

  revalidatePath("/settings/team");
  return { ok: true };
}

/**
 * Stored and exposed now, per spec — but honestly inert: no member-facing
 * "team directory" view exists anywhere yet for these toggles to gate. This
 * is config for a later chunk to consume, not enforcement with a real
 * effect today.
 */
export async function getTeamPrivacyAction(organizationId: string): Promise<TeamPrivacySettings> {
  const stored = await getSetting<TeamPrivacySettings>(organizationId, TEAM_PRIVACY_KEY);
  return stored ?? DEFAULT_TEAM_PRIVACY;
}

export async function updateTeamPrivacyAction(formData: FormData): Promise<ActionResult> {
  const { session, organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["edit"] }, organizationId);

  const settings: TeamPrivacySettings = {
    allowTeamVisibility: formData.get("allowTeamVisibility") === "true",
    showName: formData.get("showName") === "true",
    showEmail: formData.get("showEmail") === "true",
    showAvatar: formData.get("showAvatar") === "true",
  };

  await setSetting(organizationId, TEAM_PRIVACY_KEY, JSON.parse(JSON.stringify(settings)));
  await audit({
    organizationId,
    actorUserId: session.user.id,
    action: "team.privacy_update",
    recordType: "TenantSetting",
    recordId: TEAM_PRIVACY_KEY,
    after: JSON.parse(JSON.stringify(settings)),
  });

  revalidatePath("/settings/team");
  return { ok: true };
}
