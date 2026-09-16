import type { Metadata } from "next";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
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
    <div className="flex flex-col gap-8">
      <PageBreadcrumb
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings", href: "/settings" }, { label: "Team Management" }]}
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Team Management</h1>
          <p className="text-sm text-muted-foreground">Invite teammates and manage their access.</p>
        </div>
        <InviteMemberDialog />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Members</h2>
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
                <TableCell className="capitalize">{member.role}</TableCell>
                <TableCell>{member.disabledAt ? "Disabled" : "Active"}</TableCell>
                <TableCell>{member.createdAt.toLocaleDateString()}</TableCell>
                <TableCell>
                  <MemberRowActions memberId={member.id} role={member.role} disabled={!!member.disabledAt} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {invitations.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Pending Invitations</h2>
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
                  <TableCell className="capitalize">{invitation.role}</TableCell>
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
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Team Privacy</h2>
        <p className="max-w-lg text-xs text-muted-foreground">
          Controls what teammates see about each other — this never restricts what Owners/Admins can see.
        </p>
        <TeamPrivacyForm initialValues={teamPrivacy} />
      </div>
    </div>
  );
}
