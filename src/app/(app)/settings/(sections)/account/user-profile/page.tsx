import type { Metadata } from "next";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { roleLabel } from "@/lib/auth/role-metadata";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { EditablePanel } from "../../../_components/editable-panel";
import { Detail, DetailGrid, SettingsCard, SettingsSection } from "../../../_components/settings-ui";
import { UserProfileForm } from "./_components/user-profile-form";

export const metadata: Metadata = {
  title: "User Profile — Platterly",
  robots: { index: false, follow: false },
};

const formatDate = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

export default async function UserProfilePage() {
  const { session, organizationId } = await requireActiveOrganization();
  const member = await prisma.member.findFirstOrThrow({
    where: { userId: session.user.id, organizationId },
  });
  const { firstName, lastName, email } = session.user;
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  const initials = (`${(firstName ?? "").charAt(0)}${(lastName ?? "").charAt(0)}` || email.charAt(0)).toUpperCase();

  return (
    <SettingsCard title="User Profile" description="Your personal account details.">
      <EditablePanel
        editLabel="Edit Profile"
        heading={
          <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">
          {initials}
        </span>
        <div>
          <p className="font-semibold">{name || "No name provided"}</p>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>
      </div>
        }
        badge={<Badge variant="info">{roleLabel(member.role)}</Badge>}
        view={
          <>
            <SettingsSection title="Personal Information">
              <DetailGrid>
                <Detail label="First Name" value={firstName} />
                <Detail label="Last Name" value={lastName} />
              </DetailGrid>
            </SettingsSection>
            <SettingsSection title="Account Information">
              <DetailGrid>
                <Detail label="Email Address" value={email} />
                <Detail label="Account Role" value={roleLabel(member.role)} />
                <Detail label="Account Created" value={formatDate(session.user.createdAt)} />
                <Detail label="Last Updated" value={formatDate(session.user.updatedAt)} />
              </DetailGrid>
            </SettingsSection>
          </>
        }
        edit={
          <UserProfileForm
            initialFirstName={firstName ?? ""}
            initialLastName={lastName ?? ""}
            email={email}
            role={roleLabel(member.role)}
            createdAt={formatDate(session.user.createdAt)}
            updatedAt={formatDate(session.user.updatedAt)}
          />
        }
      />
    </SettingsCard>
  );
}
