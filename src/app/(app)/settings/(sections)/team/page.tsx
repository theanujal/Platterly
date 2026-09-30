import type { Metadata } from "next";
import { ShieldCheck, UserPlus, Users } from "lucide-react";
import { SettingsCard, SettingsPanel, SettingsSection } from "../../_components/settings-ui";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { roleLabel } from "@/lib/auth/role-metadata";
import { listMembers, listPendingInvitations } from "@/modules/team/team";
import { getTeamPrivacyAction } from "./actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InviteMemberDialog } from "./_components/invite-member-dialog";
import { MemberRowActions } from "./_components/member-row-actions";
import { InvitationRowActions } from "./_components/invitation-row-actions";
import { TeamPrivacyForm } from "./_components/team-privacy-form";

export const metadata: Metadata = {
  title: "Team Management — Platterly",
  robots: { index: false, follow: false },
};

export default async function TeamPage() {
  const { organizationId } = await requireActiveOrganization();
  // Denies Staff outright (staff.users === []) — they never see this page.
  await requirePermission({ users: ["view"] }, organizationId);

  const [members, invitations, teamPrivacy] = await Promise.all([
    listMembers(organizationId),
    listPendingInvitations(organizationId),
    getTeamPrivacyAction(organizationId),
  ]);

  return (
    <SettingsCard title="Team Management" description="Invite teammates and manage their access." action={<InviteMemberDialog />}>
      <SettingsPanel>

      <SettingsSection icon={Users} title="Members">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">{member.user.name}</TableCell>
                <TableCell className="text-muted-foreground">{member.user.email}</TableCell>
                <TableCell>{roleLabel(member.role)}</TableCell>
                <TableCell>{member.disabledAt ? "Disabled" : "Active"}</TableCell>
                <TableCell>{member.createdAt.toLocaleDateString()}</TableCell>
                <TableCell>
                  <MemberRowActions memberId={member.id} role={member.role} disabled={!!member.disabledAt} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SettingsSection>

      {invitations.length > 0 && (
        <SettingsSection icon={UserPlus} title="Pending Invitations">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell className="font-medium">{invitation.email}</TableCell>
                  <TableCell>{roleLabel(invitation.role ?? "staff")}</TableCell>
                  <TableCell className={invitation.expiresAt < new Date() ? "text-destructive" : undefined}>
                    {invitation.expiresAt < new Date() ? "Expired" : invitation.expiresAt.toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <InvitationRowActions
                      invitationId={invitation.id}
                      email={invitation.email}
                      role={invitation.role ?? "staff"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SettingsSection>
      )}

      <SettingsSection icon={ShieldCheck} title="Team Privacy" description="Controls what teammates see about each other — this never restricts what Owners can see.">
        <TeamPrivacyForm initialValues={teamPrivacy} />
      </SettingsSection>
      </SettingsPanel>
    </SettingsCard>
  );
}
