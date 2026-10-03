import type { Metadata } from "next";
import { Mail, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PanelHeader, SettingsCard, SettingsPanel } from "../../_components/settings-ui";
import { hasPermission, requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { INVITABLE_ROLE_DEFINITIONS, roleLabel } from "@/lib/auth/role-metadata";
import { describeRolePermissions } from "@/lib/auth/role-permissions";
import { applyTeamPrivacy, getSeatUsage, listMembers, listPendingInvitations } from "@/modules/team/team";
import { INVITATION_EXPIRY_HOURS } from "@/modules/team/invitation-config";
import { getTeamPrivacyAction } from "./actions";
import { InviteMemberForm } from "./_components/invite-member-form";
import { InvitationRowActions } from "./_components/invitation-row-actions";
import { MemberRowActions } from "./_components/member-row-actions";
import { TeamPrivacyForm } from "./_components/team-privacy-form";
import { TeamTabs, type TeamTab } from "./_components/team-tabs";
import { RoleIcon } from "./_components/role-icons";

export const metadata: Metadata = {
  title: "Team Management — Platterly",
  robots: { index: false, follow: false },
};

const formatDate = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant={role === "owner" ? "default" : "neutral"}>
      <RoleIcon role={role} />
      {roleLabel(role)}
    </Badge>
  );
}

function expiryLabel(expiresAt: Date): { text: string; expired: boolean } {
  const hoursLeft = Math.ceil((expiresAt.getTime() - Date.now()) / 3_600_000);
  if (hoursLeft <= 0) return { text: "Expired", expired: true };
  return { text: `Expires in ${hoursLeft}h`, expired: false };
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { organizationId, session } = await requireActiveOrganization();
  // Denies Staff outright (staff.users === []) — they never see this page.
  await requirePermission({ users: ["view"] }, organizationId);

  const [allMembers, invitations, teamPrivacy, seats, canInvite, canManage, canEditSettings, params] = await Promise.all([
    listMembers(organizationId),
    listPendingInvitations(organizationId),
    getTeamPrivacyAction(),
    getSeatUsage(organizationId),
    hasPermission({ users: ["create"] }, organizationId),
    hasPermission({ users: ["edit", "delete"] }, organizationId),
    hasPermission({ settings: ["edit"] }, organizationId),
    searchParams,
  ]);

  const viewer = { userId: session.user.id, role: allMembers.find((m) => m.userId === session.user.id)?.role ?? "staff" };
  const members = applyTeamPrivacy(allMembers, viewer, teamPrivacy);

  const tabs: TeamTab[] = [
    { id: "members", label: "Team Members", icon: Users },
    ...(canInvite ? [{ id: "invite", label: "Invite Member", icon: UserPlus }] : []),
    { id: "pending", label: "Pending Invitations", icon: Mail, count: invitations.length },
    { id: "privacy", label: "Privacy", icon: ShieldCheck },
  ];
  const active = tabs.some((t) => t.id === params.tab) ? (params.tab as string) : "members";

  const roleOptions = INVITABLE_ROLE_DEFINITIONS.map((r) => ({
    id: r.id,
    label: r.label,
    description: r.description,
    ...describeRolePermissions(r.id),
  }));

  return (
    <SettingsCard title="Team Management" description="Manage your team members, roles and permissions.">
      <p className="text-sm text-muted-foreground">
        Team members: {seats.members}
        {seats.limit !== null && `/${seats.limit}`}
      </p>

      <TeamTabs tabs={tabs} active={active} />

      <SettingsPanel>
        {active === "members" && (
          <>
            <PanelHeader icon={Users} title="Team Members" description="View and manage your team members and their roles." />
            <ul className="flex flex-col gap-3">
              {members.map((member) => {
                const isYou = member.userId === session.user.id;
                return (
                  <li key={member.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-4">
                    {member.user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a user-supplied avatar URL, not a static asset
                      <img src={member.user.image} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary">
                        {member.user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {member.user.name}
                        {isYou && <Badge variant="outline">You</Badge>}
                        {member.disabledAt && <Badge variant="danger">Disabled</Badge>}
                      </p>
                      {member.user.email && <p className="text-sm text-muted-foreground">{member.user.email}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <RoleBadge role={member.role} />
                        <span className="text-xs text-muted-foreground">Joined {formatDate(member.createdAt)}</span>
                      </div>
                    </div>
                    {canManage && !isYou && (
                      <MemberRowActions memberId={member.id} role={member.role} disabled={!!member.disabledAt} />
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {active === "invite" && (
          <>
            <PanelHeader icon={UserPlus} title="Invite Team Member" description="Send an invitation to add a new member to your team." />
            <InviteMemberForm
              roles={roleOptions}
              seatsFullMessage={
                seats.full ? `Your plan allows ${seats.limit} team members, including pending invitations. Cancel an invitation or upgrade to add more.` : null
              }
            />
          </>
        )}

        {active === "pending" && (
          <>
            <PanelHeader icon={Mail} title="Pending Invitations" description="Manage invitations that haven't been accepted yet." />
            {invitations.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-10 text-center text-muted-foreground">
                <Mail className="mb-2 size-12" strokeWidth={1.5} />
                <p className="font-medium">No pending invitations.</p>
                <p className="text-sm">All sent invitations have been accepted or expired.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {invitations.map((invitation) => {
                  const expiry = expiryLabel(invitation.expiresAt);
                  const role = invitation.role ?? "staff";
                  return (
                    <li key={invitation.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-4">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Mail className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{invitation.email}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <RoleBadge role={role} />
                          <Badge variant={expiry.expired ? "danger" : "warning"}>{expiry.text}</Badge>
                          <span className="text-xs text-muted-foreground">Sent {formatDate(invitation.createdAt)}</span>
                        </div>
                      </div>
                      {canInvite && <InvitationRowActions invitationId={invitation.id} email={invitation.email} role={role} />}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">Invitation links are valid for {INVITATION_EXPIRY_HOURS} hours.</p>
          </>
        )}

        {active === "privacy" && <TeamPrivacyForm initialValues={teamPrivacy} canEdit={canEditSettings} />}
      </SettingsPanel>
    </SettingsCard>
  );
}
